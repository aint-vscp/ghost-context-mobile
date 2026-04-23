// COMP 304 — Introduction to AI · Practice Quiz Generator
// Builds two PDFs in C:\Users\Vash\Downloads:
//   COMP304_Quiz.pdf            (questions only, choices A–E, E = no answer)
//   COMP304_Quiz_AnswerKey.pdf  (answers + 1-line rationale)
//
// Scope:
//  1. Introduction to AI          (definition, foundations, history, applications, ethics)
//  2. Intelligent Agents          (agents/env, types, rationality, nature of env)
//  3. Solving Problems by Search  (problem-solving agents, search, uninformed strategies)

const path = require('path');
const fs   = require('fs');
const PDFDocument = require('pdfkit');

const OUT_DIR = 'C:\\Users\\Vash\\Downloads';
const Q_PDF   = path.join(OUT_DIR, 'COMP304_Quiz.pdf');
const A_PDF   = path.join(OUT_DIR, 'COMP304_Quiz_AnswerKey.pdf');

// ---- 60 questions — A..D real options, E = "No answer / I don't know" ----
const NA = "No answer";
const Q = [
  // ===== Section 1 — Introduction to AI =====
  { topic: "Intro to AI",
    q: "Which of the following best defines Artificial Intelligence?",
    c: ["The study of how to make computers faster.",
        "The science and engineering of making intelligent machines that can perceive, reason, and act.",
        "Programming a computer using only Boolean logic.",
        "Replacing human jobs with robotic process automation.",
        NA],
    a: "B", why: "AI = building agents that perceive their environment and act intelligently."
  },
  { topic: "Intro to AI",
    q: "Which of the following is NOT one of the four classical approaches to defining AI?",
    c: ["Thinking humanly","Acting humanly","Thinking rationally","Acting rationally","Thinking randomly"],
    a: "E", why: "Russell & Norvig list the four; 'thinking randomly' is not among them."
  },
  { topic: "Intro to AI",
    q: "The Turing Test primarily measures a machine's ability to:",
    c: ["Solve mathematical theorems.",
        "Beat humans at chess.",
        "Exhibit conversational behavior indistinguishable from a human.",
        "Run faster than a human brain.",
        NA],
    a: "C", why: "Turing's imitation game tests indistinguishability in conversation."
  },
  { topic: "Intro to AI",
    q: "Which discipline contributed the formal study of logic and provability that underpins symbolic AI?",
    c: ["Linguistics","Philosophy / Mathematics","Economics","Neuroscience",NA],
    a: "B", why: "Logic and proof come from philosophy and mathematics."
  },
  { topic: "Intro to AI",
    q: "Which discipline contributed the idea of utility and decision making under uncertainty?",
    c: ["Economics","Biology","Geology","Astronomy",NA],
    a: "A", why: "Utility theory and game theory come from economics."
  },
  { topic: "Intro to AI",
    q: "The Dartmouth Workshop, considered the birth of AI as a field, took place in:",
    c: ["1943","1950","1956","1969",NA],
    a: "C", why: "Dartmouth Summer Research Project on AI, 1956."
  },
  { topic: "Intro to AI",
    q: "Who coined the term 'Artificial Intelligence'?",
    c: ["Alan Turing","John McCarthy","Marvin Minsky","Herbert Simon",NA],
    a: "B", why: "John McCarthy proposed the term for the 1956 Dartmouth workshop."
  },
  { topic: "Intro to AI",
    q: "Which event is associated with the first 'AI Winter'?",
    c: ["Publication of Perceptrons (1969) and Lighthill report (1973).",
        "Release of ChatGPT.",
        "Founding of DeepMind.",
        "Apollo 11 moon landing.",
        NA],
    a: "A", why: "Critiques of perceptrons and the Lighthill report cut funding in the 70s."
  },
  { topic: "Intro to AI",
    q: "Which is an example of a strong (general) AI claim?",
    c: ["A spam filter that classifies email.",
        "A chess engine that only plays chess.",
        "A machine that can perform any intellectual task a human can.",
        "A face-detection model.",
        NA],
    a: "C", why: "Strong / AGI = human-level general intelligence across tasks."
  },
  { topic: "Intro to AI",
    q: "Which of the following is LEAST associated with current applications of AI?",
    c: ["Recommender systems","Speech recognition","Autonomous vehicles","Mechanical pencil sharpening","Medical image analysis"],
    a: "D", why: "Pencil sharpening is purely mechanical; the others are real AI domains."
  },
  { topic: "AI Ethics",
    q: "Which is the BEST description of algorithmic bias?",
    c: ["A model running slowly on biased hardware.",
        "Systematic, unfair outcomes from a model, often reflecting biased training data or design choices.",
        "A model that uses too much memory.",
        "A model that prefers GPUs over CPUs.",
        NA],
    a: "B", why: "Bias = systematic unfairness, often inherited from data."
  },
  { topic: "AI Ethics",
    q: "Which principle is MOST related to 'explainability' in AI ethics?",
    c: ["The model's accuracy on a benchmark.",
        "The ability of a system to provide understandable reasons for its decisions.",
        "The speed of inference.",
        "The cost of training.",
        NA],
    a: "B", why: "Explainability = humans can understand why a decision was made."
  },
  { topic: "AI Ethics",
    q: "Which is NOT a commonly cited pillar of ethical AI?",
    c: ["Fairness","Accountability","Transparency","Profit maximization","Privacy"],
    a: "D", why: "Profit is a business goal, not an ethical AI pillar."
  },
  { topic: "AI Ethics",
    q: "A self-driving car must decide between two harmful outcomes. This dilemma is most associated with:",
    c: ["The halting problem","The trolley problem","The traveling salesman problem","The frame problem",NA],
    a: "B", why: "The trolley problem is the classic ethical dilemma referenced for AVs."
  },

  // ===== Section 2 — Intelligent Agents =====
  { topic: "Agents",
    q: "An agent is BEST described as:",
    c: ["A piece of hardware only.",
        "Anything that perceives its environment through sensors and acts upon it through actuators.",
        "A graphical user interface.",
        "A type of database.",
        NA],
    a: "B", why: "Standard textbook definition (Russell & Norvig)."
  },
  { topic: "Agents",
    q: "An agent's percept sequence is:",
    c: ["The single most recent percept.",
        "The complete history of everything the agent has ever perceived.",
        "The list of actions the agent will take.",
        "The agent's internal program.",
        NA],
    a: "B", why: "Percept sequence = full history of percepts up to now."
  },
  { topic: "Agents",
    q: "An agent function maps:",
    c: ["Actions to percepts.",
        "Percept sequences to actions.",
        "States to rewards.",
        "Goals to plans.",
        NA],
    a: "B", why: "Agent function: percept sequence → action."
  },
  { topic: "Agents",
    q: "Which of the following is the SIMPLEST type of agent?",
    c: ["Model-based reflex agent",
        "Goal-based agent",
        "Simple reflex agent",
        "Utility-based agent",
        "Learning agent"],
    a: "C", why: "Simple reflex agents act only on the current percept via condition-action rules."
  },
  { topic: "Agents",
    q: "A model-based reflex agent improves on a simple reflex agent by:",
    c: ["Maintaining an internal state of the world.",
        "Always exploring randomly.",
        "Ignoring percepts.",
        "Only using utility functions.",
        NA],
    a: "A", why: "It tracks world state to handle partial observability."
  },
  { topic: "Agents",
    q: "Which agent type chooses actions based on expected satisfaction of preferences over outcomes?",
    c: ["Simple reflex","Model-based reflex","Goal-based","Utility-based",NA],
    a: "D", why: "Utility-based agents maximize expected utility."
  },
  { topic: "Agents",
    q: "A learning agent's 'critic' is responsible for:",
    c: ["Choosing the next action.",
        "Telling the learning element how well the agent is doing relative to a fixed performance standard.",
        "Storing the world model.",
        "Generating new percepts.",
        NA],
    a: "B", why: "Critic provides feedback against an external performance standard."
  },
  { topic: "Rationality",
    q: "A rational agent is one that:",
    c: ["Always achieves the optimal outcome regardless of information.",
        "For each possible percept sequence, selects an action expected to maximize its performance measure given its knowledge.",
        "Acts identically to a human.",
        "Never makes mistakes.",
        NA],
    a: "B", why: "Rationality is bounded by what the agent knows and the performance measure."
  },
  { topic: "Rationality",
    q: "Which of the following is NOT part of the PEAS description of a task environment?",
    c: ["Performance measure","Environment","Actuators","Sensors","Programmer"],
    a: "E", why: "PEAS = Performance, Environment, Actuators, Sensors. Programmer is not part of it."
  },
  { topic: "Environments",
    q: "An environment is FULLY OBSERVABLE if:",
    c: ["The agent can see only its current location.",
        "Sensors give access to the complete state of the environment at each point in time.",
        "There is no noise in the percepts.",
        "Other agents are visible.",
        NA],
    a: "B", why: "Definition of full observability."
  },
  { topic: "Environments",
    q: "Chess (with a clock) is best classified as:",
    c: ["Partially observable, stochastic, sequential, dynamic, continuous.",
        "Fully observable, deterministic, sequential, semi-dynamic, discrete.",
        "Fully observable, stochastic, episodic, static, continuous.",
        "Partially observable, deterministic, episodic, dynamic, discrete.",
        NA],
    a: "B", why: "Classical chess: full info, deterministic moves, sequential, semi-dynamic with clock, discrete."
  },
  { topic: "Environments",
    q: "Taxi driving is BEST classified as:",
    c: ["Fully observable and deterministic.",
        "Partially observable, stochastic, sequential, dynamic, and continuous.",
        "Episodic and static.",
        "Single-agent and discrete.",
        NA],
    a: "B", why: "Real driving has every 'hard' property at once."
  },
  { topic: "Environments",
    q: "A STOCHASTIC environment is one where:",
    c: ["The next state is fully determined by the current state and action.",
        "The next state has some randomness given the current state and action.",
        "The agent has no sensors.",
        "There is only one agent.",
        NA],
    a: "B", why: "Stochastic = nondeterministic transitions with probabilities."
  },
  { topic: "Environments",
    q: "A SEMI-DYNAMIC environment is one in which:",
    c: ["The environment changes while the agent deliberates.",
        "The environment itself does not change with time, but the agent's performance score does.",
        "The agent never receives percepts.",
        "Time does not exist.",
        NA],
    a: "B", why: "Classic example: chess with a clock."
  },
  { topic: "Environments",
    q: "Which environment property best describes a crossword puzzle?",
    c: ["Episodic and stochastic.",
        "Fully observable, deterministic, sequential, static, discrete, single-agent.",
        "Partially observable and continuous.",
        "Multi-agent and dynamic.",
        NA],
    a: "B", why: "Crosswords have all the easy properties."
  },
  { topic: "Environments",
    q: "An EPISODIC task environment is characterized by:",
    c: ["Each action depending on a long history of past actions.",
        "The agent's experience being divided into atomic episodes whose outcomes do not depend on actions in previous episodes.",
        "Continuous time.",
        "Multiple cooperating agents.",
        NA],
    a: "B", why: "Episodic = each episode is independent (e.g., classifying images one by one)."
  },
  { topic: "Agents",
    q: "Which of the following is a COMPETITIVE multi-agent environment?",
    c: ["A vacuum cleaner alone in a room.",
        "Two chess players in a tournament game.",
        "A robot sorting boxes by itself.",
        "A spam filter.",
        NA],
    a: "B", why: "Chess: each player's win is the other's loss."
  },

  // ===== Section 3 — Solving Problems by Searching =====
  { topic: "Problem Solving",
    q: "Problem-solving agents are a kind of:",
    c: ["Reflex agent that ignores goals.",
        "Goal-based agent that uses search to plan a sequence of actions.",
        "Utility-based agent that uses neural networks.",
        "Learning agent that has no model.",
        NA],
    a: "B", why: "Problem solving = planning a sequence of actions toward a goal."
  },
  { topic: "Problem Solving",
    q: "Which of the following is NOT one of the components of a well-defined problem?",
    c: ["Initial state","Actions / successor function","Goal test","Path cost","User interface"],
    a: "E", why: "Components: initial state, actions, transition model, goal test, path cost. UI is not part of the formal problem."
  },
  { topic: "Problem Solving",
    q: "The state space of a problem is:",
    c: ["A list of goals only.",
        "The set of all states reachable from the initial state by any sequence of actions.",
        "The set of all percepts.",
        "The set of all heuristics.",
        NA],
    a: "B", why: "Definition of state space."
  },
  { topic: "Problem Solving",
    q: "A SOLUTION to a search problem is:",
    c: ["A single state.",
        "A path from the initial state to a goal state.",
        "A heuristic function.",
        "A frontier.",
        NA],
    a: "B", why: "Solution = sequence of actions / path that ends at a goal."
  },
  { topic: "Problem Solving",
    q: "An OPTIMAL solution is one that:",
    c: ["Finds the goal first.",
        "Has the lowest path cost among all solutions.",
        "Uses the least memory.",
        "Uses no heuristic.",
        NA],
    a: "B", why: "Optimality is defined w.r.t. path cost."
  },
  { topic: "Search",
    q: "The 'frontier' (or fringe) in a search algorithm refers to:",
    c: ["States already expanded.",
        "States that have been generated but not yet expanded.",
        "Goal states only.",
        "States with the lowest heuristic value.",
        NA],
    a: "B", why: "Frontier = open set of unexpanded nodes."
  },
  { topic: "Search",
    q: "Which property states that a search algorithm always finds a solution if one exists?",
    c: ["Optimality","Completeness","Time complexity","Space complexity",NA],
    a: "B", why: "Completeness = guaranteed to find a solution if one exists."
  },
  { topic: "Search",
    q: "Which of the following is NOT a standard performance measure for search algorithms?",
    c: ["Completeness","Optimality","Time complexity","Space complexity","Color"],
    a: "E", why: "The four classic measures are completeness, optimality, time, and space."
  },
  { topic: "Uninformed",
    q: "Uninformed (blind) search strategies:",
    c: ["Use problem-specific knowledge to guide search.",
        "Have no information about the cost or distance to the goal beyond the problem definition.",
        "Always use a heuristic.",
        "Are guaranteed optimal.",
        NA],
    a: "B", why: "Uninformed = no domain knowledge beyond the problem definition."
  },
  { topic: "Uninformed",
    q: "Breadth-First Search (BFS) uses which data structure for the frontier?",
    c: ["Stack (LIFO)","Queue (FIFO)","Priority queue","Hash map",NA],
    a: "B", why: "BFS expands shallowest nodes first → FIFO queue."
  },
  { topic: "Uninformed",
    q: "Depth-First Search (DFS) uses which data structure for the frontier?",
    c: ["Stack (LIFO)","Queue (FIFO)","Priority queue ordered by f(n)","Min-heap on heuristic",NA],
    a: "A", why: "DFS expands deepest nodes first → LIFO stack."
  },
  { topic: "Uninformed",
    q: "Which of the following is TRUE of BFS on a tree with branching factor b and shallowest goal at depth d?",
    c: ["Time and space are both O(b^d).",
        "Time is O(bd) and space is O(d).",
        "Time is O(d) and space is O(1).",
        "It is incomplete.",
        NA],
    a: "A", why: "BFS time and memory are both exponential in d."
  },
  { topic: "Uninformed",
    q: "BFS is guaranteed OPTIMAL when:",
    c: ["The heuristic is admissible.",
        "All step costs are equal (uniform).",
        "The branching factor is 1.",
        "The graph is a tree.",
        NA],
    a: "B", why: "BFS finds shallowest goal; that is optimal only if all step costs are equal."
  },
  { topic: "Uninformed",
    q: "Uniform-Cost Search (UCS) expands the node with the lowest:",
    c: ["Heuristic value h(n).",
        "Path cost g(n) so far.",
        "Depth d(n).",
        "f(n) = g(n) + h(n).",
        NA],
    a: "B", why: "UCS = priority by g(n)."
  },
  { topic: "Uninformed",
    q: "UCS is guaranteed OPTIMAL provided:",
    c: ["The heuristic is admissible.",
        "Step costs are non-negative.",
        "The state space is infinite.",
        "BFS would also work.",
        NA],
    a: "B", why: "UCS is optimal when all step costs are ≥ 0 (strictly > 0 for completeness)."
  },
  { topic: "Uninformed",
    q: "DFS is generally NOT optimal because:",
    c: ["It uses too much memory.",
        "It may find a deep, costly solution before a shallow, cheap one.",
        "It cannot handle finite state spaces.",
        "It needs a heuristic.",
        NA],
    a: "B", why: "DFS dives deep; first solution found is rarely the cheapest."
  },
  { topic: "Uninformed",
    q: "DFS is generally NOT complete on:",
    c: ["Finite state spaces with cycle checking.",
        "Infinite-depth state spaces or those with infinite loops without cycle checking.",
        "Trees with shallow goals.",
        "Single-state problems.",
        NA],
    a: "B", why: "DFS can dive forever down an infinite branch."
  },
  { topic: "Uninformed",
    q: "Depth-Limited Search (DLS) is DFS with:",
    c: ["A heuristic estimate.",
        "A predetermined maximum depth limit ℓ on expansions.",
        "A FIFO frontier.",
        "Bidirectional expansion.",
        NA],
    a: "B", why: "DLS caps DFS at depth ℓ."
  },
  { topic: "Uninformed",
    q: "Iterative Deepening Search (IDS) combines the benefits of:",
    c: ["BFS and A*.",
        "BFS's optimality / completeness with DFS's low memory use.",
        "Greedy search and UCS.",
        "DFS and bidirectional search.",
        NA],
    a: "B", why: "IDS = repeated DLS; gets BFS-like guarantees with DFS-like memory."
  },
  { topic: "Uninformed",
    q: "What is the space complexity of IDS in a tree with branching factor b and goal depth d?",
    c: ["O(b^d)","O(bd)","O(d)","O(log d)",NA],
    a: "B", why: "IDS uses O(bd) memory like DFS at each depth limit."
  },
  { topic: "Uninformed",
    q: "Bidirectional search works by:",
    c: ["Searching backward only.",
        "Running two simultaneous searches — one forward from the start, one backward from the goal — until they meet.",
        "Using two heuristics at once.",
        "Alternating BFS and DFS at each step.",
        NA],
    a: "B", why: "Two searches meet in the middle; can cut time roughly to O(b^(d/2))."
  },
  { topic: "Uninformed",
    q: "A repeated state in graph search is best handled by:",
    c: ["Always re-expanding it.",
        "Maintaining an explored (closed) set so each state is expanded at most once.",
        "Increasing the branching factor.",
        "Using DFS only.",
        NA],
    a: "B", why: "Graph search uses an explored set to avoid redundancy."
  },
  { topic: "Uninformed",
    q: "Which uninformed strategy is generally PREFERRED when the search tree is very deep but solutions are at unknown depth and memory is limited?",
    c: ["BFS","DFS","Iterative Deepening Search","Bidirectional BFS",NA],
    a: "C", why: "IDS is the standard recommendation for unknown-depth, memory-limited blind search."
  },
  { topic: "Uninformed",
    q: "If b = 10 and the shallowest goal is at depth d = 5, the approximate number of nodes BFS may generate is on the order of:",
    c: ["50","500","100,000","10,000,000",NA],
    a: "C", why: "10^5 = 100,000 — BFS time and space grow as b^d."
  },
  { topic: "Uninformed",
    q: "Which of the following is TRUE about UCS vs BFS?",
    c: ["UCS == BFS when all step costs are equal positive constants.",
        "UCS always uses less memory than BFS.",
        "BFS is optimal even with varying step costs.",
        "UCS requires a heuristic.",
        NA],
    a: "A", why: "With uniform step cost, UCS reduces to BFS."
  },
  { topic: "Problem Solving",
    q: "In the 8-puzzle, the state space size (reachable configurations) is approximately:",
    c: ["72","362,880 / 2 ≈ 181,440 reachable","9!","16!",NA],
    a: "B", why: "9! = 362,880 total, but only half are reachable from a given start."
  },
  { topic: "Problem Solving",
    q: "Formulating a problem means:",
    c: ["Writing the code that solves it.",
        "Deciding what actions and states to consider given a goal.",
        "Running a benchmark.",
        "Choosing a programming language.",
        NA],
    a: "B", why: "Problem formulation = choosing states/actions abstraction for a goal."
  },
  { topic: "Problem Solving",
    q: "An agent that has multiple goals it must trade off should be modeled as a:",
    c: ["Simple reflex agent.",
        "Utility-based agent.",
        "Random agent.",
        "Table-driven agent.",
        NA],
    a: "B", why: "Utility lets you trade off competing goals quantitatively."
  },
  { topic: "Search",
    q: "Which is TRUE of tree search vs graph search?",
    c: ["Tree search is always faster.",
        "Graph search avoids revisiting already-expanded states by maintaining an explored set; tree search does not.",
        "Graph search cannot find optimal solutions.",
        "Tree search uses no frontier.",
        NA],
    a: "B", why: "Graph search adds an explored set; tree search doesn't."
  },
];

// sanity
if (Q.length < 50) throw new Error('need at least 50 questions, got ' + Q.length);

// ---------- render helpers ----------
function newDoc(title) {
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 60, bottom: 56, left: 60, right: 60 },
    info: { Title: title, Author: 'Ghost Context Mobile', Subject: 'COMP 304 — Introduction to AI' }
  });
  return doc;
}

function header(doc, title, sub) {
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#000').text(title, { align: 'left' });
  doc.font('Helvetica').fontSize(10).fillColor('#444').text(sub, { align: 'left' });
  doc.moveDown(0.4);
  doc.moveTo(doc.page.margins.left, doc.y)
     .lineTo(doc.page.width - doc.page.margins.right, doc.y)
     .strokeColor('#888').lineWidth(0.6).stroke();
  doc.moveDown(0.6);
}

function pageFooter(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.height - 40;
    doc.font('Helvetica').fontSize(9).fillColor('#666')
       .text(`COMP 304 · Practice Quiz · page ${i - range.start + 1} of ${range.count}`,
             doc.page.margins.left, bottom,
             { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' });
  }
}

function ensureSpace(doc, needed) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

// ---------- build questions PDF ----------
function buildQuestions() {
  const doc = newDoc('COMP 304 Practice Quiz');
  const stream = fs.createWriteStream(Q_PDF);
  doc.pipe(stream);

  header(doc,
    'COMP 304 — Introduction to Artificial Intelligence',
    `Practice Quiz · ${Q.length} multiple-choice questions · choose A, B, C, D, or E (E = ${NA}).`);

  doc.font('Helvetica').fontSize(10).fillColor('#444')
     .text('Topics covered: Introduction to AI · Intelligent Agents · Solving Problems by Searching (Uninformed Search).');
  doc.moveDown(0.4);
  doc.font('Helvetica-Oblique').fontSize(10).fillColor('#444')
     .text('Instructions: Read each question carefully. Select the single best answer. Use option E only when you genuinely do not know — it scores the same as a wrong answer in most graders.');
  doc.moveDown(0.8);

  Q.forEach((item, i) => {
    const num = String(i + 1).padStart(2, '0');
    // estimate height
    ensureSpace(doc, 110);

    doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#000')
       .text(`${num}. [${item.topic}]  `, { continued: true })
       .font('Helvetica').fontSize(11).fillColor('#000').text(item.q);
    doc.moveDown(0.2);
    const letters = ['A','B','C','D','E'];
    item.c.forEach((choice, k) => {
      doc.font('Helvetica').fontSize(10.5).fillColor('#111')
         .text(`    ${letters[k]}. ${choice}`, { lineGap: 1 });
    });
    doc.moveDown(0.6);
  });

  pageFooter(doc);
  doc.end();
  return new Promise(res => stream.on('finish', res));
}

// ---------- build answer key PDF ----------
function buildAnswers() {
  const doc = newDoc('COMP 304 Practice Quiz · Answer Key');
  const stream = fs.createWriteStream(A_PDF);
  doc.pipe(stream);

  header(doc,
    'COMP 304 — Introduction to Artificial Intelligence',
    `Answer Key · ${Q.length} questions · single best answer per item.`);

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text('Quick reference grid');
  doc.moveDown(0.3);

  // 5-column grid of "01 → B"
  const cols = 5;
  const colW = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / cols;
  const startX = doc.page.margins.left;
  const startY = doc.y;
  const rowH = 14;
  doc.font('Helvetica').fontSize(10).fillColor('#000');
  Q.forEach((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * colW;
    const y = startY + row * rowH;
    doc.text(`${String(i+1).padStart(2,'0')}. ${item.a}`, x, y, { width: colW - 6 });
  });
  const gridBottom = startY + Math.ceil(Q.length / cols) * rowH;
  doc.y = gridBottom + 12;

  doc.moveTo(doc.page.margins.left, doc.y)
     .lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#888').lineWidth(0.5).stroke();
  doc.moveDown(0.5);

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text('Explanations');
  doc.moveDown(0.4);

  Q.forEach((item, i) => {
    ensureSpace(doc, 50);
    const num = String(i + 1).padStart(2, '0');
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#000')
       .text(`${num}. Answer: ${item.a}  `, { continued: true })
       .font('Helvetica-Oblique').fontSize(9.5).fillColor('#555').text(`[${item.topic}]`);
    doc.font('Helvetica').fontSize(10).fillColor('#222').text(`    Q: ${item.q}`);
    doc.font('Helvetica').fontSize(10).fillColor('#000').text(`    Why: ${item.why}`);
    doc.moveDown(0.4);
  });

  pageFooter(doc);
  doc.end();
  return new Promise(res => stream.on('finish', res));
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await buildQuestions();
  await buildAnswers();
  const qsz = fs.statSync(Q_PDF).size;
  const asz = fs.statSync(A_PDF).size;
  console.log(`OK · ${Q.length} questions`);
  console.log(`-> ${Q_PDF}  (${(qsz/1024).toFixed(1)} KB)`);
  console.log(`-> ${A_PDF}  (${(asz/1024).toFixed(1)} KB)`);
})();
