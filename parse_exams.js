const fs = require('fs');
const path = require('path');

const examsDir = path.join(__dirname, '..');
const outputFilePath = path.join(__dirname, 'exams_data.js');

const examsData = [];

// Loop through exams 1 to 23
for (let examId = 1; examId <= 23; examId++) {
  const fileName = `practice-exam-${examId}.md`;
  const filePath = path.join(examsDir, fileName);

  if (!fs.existsSync(filePath)) {
    console.warn(`File ${fileName} does not exist, skipping.`);
    continue;
  }

  console.log(`Parsing ${fileName}...`);
  const content = fs.readFileSync(filePath, 'utf8');

  // Find the exam title
  const titleMatch = content.match(/#\s+(Practice Exam\s+\d+)/i);
  const examTitle = titleMatch ? titleMatch[1] : `Practice Exam ${examId}`;

  // Split by questions: questions start with a number followed by a dot and a space, e.g. "1. " at the start of a line.
  // We use a regex lookahead to split but keep the question indicator.
  const questionBlocks = content.split(/\n(?=\d+\.\s)/);

  // The first block is the header/frontmatter of the file, skip it.
  const questions = [];

  for (let i = 1; i < questionBlocks.length; i++) {
    const block = questionBlocks[i].trim();
    if (!block) continue;

    // Parse question number and text
    // The block starts with e.g. "1. Question text..."
    const questionMatch = block.match(/^(\d+)\.\s+([\s\S]*?)(?=\n\s*-\s+[A-Z]\.)/);
    if (!questionMatch) {
      console.warn(`Could not parse question structure in ${fileName}, block starts with:\n${block.substring(0, 100)}`);
      continue;
    }

    const qNum = parseInt(questionMatch[1], 10);
    let qText = questionMatch[2].trim();

    // Clean up br tags from question text
    qText = qText.replace(/<br\s*\/?>/gi, '\n').trim();

    // Parse options
    // Options look like: - A. Option text
    const options = {};
    const optionRegex = /^\s*-\s+([A-Z])\.\s*(.*)/gm;
    let optionMatch;

    while ((optionMatch = optionRegex.exec(block)) !== null) {
      const optionLetter = optionMatch[1];
      let optionText = optionMatch[2].trim();
      optionText = optionText.replace(/<br\s*\/?>/gi, '\n').trim();
      options[optionLetter] = optionText;
    }

    // Parse answer and explanation details block
    // <details markdown=1><summary markdown='span'>Answer</summary>
    //   Correct answer: D
    // </details>
    const detailsRegex = /<details[\s\S]*?>([\s\S]*?)<\/details>/i;
    const detailsMatch = block.match(detailsRegex);

    let correctAnswers = [];
    let explanation = "";

    if (detailsMatch) {
      const detailsContent = detailsMatch[1].trim();

      // Extract correct answer(s)
      const answerMatch = detailsContent.match(/Correct\s+Answer:\s*([A-E,\s]+)/i);
      if (answerMatch) {
        const rawAns = answerMatch[1].toUpperCase();
        // Extract all uppercase characters from A to E
        const matches = rawAns.match(/[A-E]/g);
        if (matches) {
          correctAnswers = matches;
        }
      }

      // Extract explanation (everything after correct answer line, if any)
      // Look for lines containing "Explanation:" or just any text after "Correct Answer: ..."
      const explanationMatch = detailsContent.match(/Correct\s+Answer:\s*[A-E,\s]+\s*([\s\S]*)/i);
      if (explanationMatch && explanationMatch[1]) {
        explanation = explanationMatch[1].trim();
        // Remove "Explanation:" prefix if it exists
        explanation = explanation.replace(/^Explanation:\s*/i, '').trim();
      }
    } else {
      console.warn(`No <details> block found for question ${qNum} in ${fileName}`);
    }

    questions.push({
      id: qNum,
      question: qText,
      options: options,
      correctAnswer: correctAnswers,
      explanation: explanation
    });
  }

  examsData.push({
    id: examId,
    title: examTitle,
    questions: questions
  });
}

// Write the parsed data as a JS script defining a global variable
const outputContent = `// Auto-generated AWS Practice Exam Database
// Total Exams: ${examsData.length}
// Total Questions: ${examsData.reduce((acc, curr) => acc + curr.questions.length, 0)}
const EXAMS_DATA = ${JSON.stringify(examsData, null, 2)};
`;

fs.writeFileSync(outputFilePath, outputContent, 'utf8');
console.log(`Successfully compiled all exams to ${outputFilePath}`);
console.log(`Total Exams compiled: ${examsData.length}`);
console.log(`Total Questions compiled: ${examsData.reduce((acc, curr) => acc + curr.questions.length, 0)}`);
