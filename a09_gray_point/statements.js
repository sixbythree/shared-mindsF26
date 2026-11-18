// Statement sets. Each set has ten statements, ordered from small, everyday ones to the biggest questions,
// so every set climbs the way the first one does. Each statement lasts SECONDS_PER_STATEMENT in script.js.
export const SETS = [
  {
    id: "small-to-big",
    name: "Small to big",
    blurb: "From pizza to God.",
    statements: [
      "You prefer pizza over French fries.",
      "Summer is the best season.",
      "Mornings are better than nights.",
      "You'd rather live in a city than in the countryside.",
      "Money can buy happiness.",
      "You'd tell a friend a hard truth before a kind lie.",
      "People are mostly good.",
      "Everything happens for a reason.",
      "There is life after death.",
      "God is real.",
    ],
  },
  {
    // Drawn from the topics of the PhilPapers Survey of professional philosophers (philsurvey.org).
    id: "philosophers",
    name: "Philosophers",
    blurb: "Questions philosophers still disagree on.",
    statements: [
      "A hot dog is a sandwich.",
      "Math is discovered, not invented.",
      "You would plug into a machine that gave you a perfectly happy life.",
      "It's right to pull the lever and kill one person to save five.",
      "Some things are wrong no matter what anyone believes.",
      "If a machine copied you atom by atom, the copy would be you.",
      "A computer could one day be truly conscious.",
      "We have free will.",
      "Life has a meaning beyond the one we give it.",
      "God exists.",
    ],
  },
  {
    id: "people-and-love",
    name: "People and love",
    blurb: "Friends, family, partners.",
    statements: [
      "Texting is better than calling.",
      "First impressions are usually right.",
      "You can stay friends with an ex.",
      "Opposites attract.",
      "It's fine to keep a secret from your partner.",
      "Everyone has a soulmate.",
      "You can love more than one person at the same time.",
      "Family comes before everything.",
      "You should forgive someone who never says sorry.",
      "Love is a choice, not a feeling.",
    ],
  },
  {
    id: "work-and-money",
    name: "Work and money",
    blurb: "What we do and what it's worth.",
    statements: [
      "Working from home is better than working in an office.",
      "Tipping should be optional.",
      "A four-day work week would be better for everyone.",
      "You should do what you love, even if it pays less.",
      "Rich people earned their wealth.",
      "Everyone deserves a basic income, whether they work or not.",
      "Hard work always pays off.",
      "Success is mostly luck.",
      "Ambition is a virtue.",
      "Your work is a big part of who you are.",
    ],
  },
  {
    id: "time-and-death",
    name: "Time and death",
    blurb: "Clocks, regrets, endings.",
    statements: [
      "Time moves faster as you get older.",
      "It's better to be early than on time.",
      "The past matters more than the future.",
      "Regret is worse than failure.",
      "You'd want to know the date you'll die.",
      "The future is already decided.",
      "You would live forever if you could.",
      "A short, full life is better than a long, quiet one.",
      "You will be remembered after you die.",
      "Death is the end.",
    ],
  },
  {
    id: "minds-and-machines",
    name: "Minds and machines",
    blurb: "Shared minds, AI and you.",
    statements: [
      "You'd rather read the book than watch the movie.",
      "You'd let an AI choose your next meal.",
      "Your phone knows you better than your friends do.",
      "Social media brings people closer together.",
      "AI art is real art.",
      "A crowd makes better decisions than an expert.",
      "Two people can truly share a thought.",
      "Machines will one day understand us better than we understand ourselves.",
      "You would upload your mind to a computer.",
      "There is something in you no machine could ever copy.",
    ],
  },
  {
    id: "truth-and-belief",
    name: "Truth and belief",
    blurb: "What's real, and how we know.",
    statements: [
      "Seeing is believing.",
      "It's okay to lie to protect someone's feelings.",
      "Most people are honest.",
      "Science can answer every question.",
      "There is one truth, not many.",
      "You can know something without being able to prove it.",
      "Suffering makes us better.",
      "Miracles happen.",
      "People can change who they are deep down.",
      "Good always wins in the end.",
    ],
  },
];

// Ten statements from mixed sets. Position i always comes from some set's i-th statement,
// so the shuffle still climbs from small to big.
export function shuffledSet() {
  const statements = [];
  for (let i = 0; i < 10; i++) {
    const options = SETS.map((s) => s.statements[i]).filter((s) => !statements.includes(s));
    statements.push(options[Math.floor(Math.random() * options.length)]);
  }
  return { id: "shuffle", name: "Shuffle", statements };
}

// ---------- Ask the machine ----------

const REPLICATE_PROXY_URL = "https://itp-ima-replicate-proxy.web.app/api/create_n_get";
const MODEL = "openai/gpt-4o-mini";

// A language model writes a new set of ten, on a topic if one is given.
export async function machineSet(topic = "") {
  const examples = SETS[0].statements;
  const prompt = [
    "Write ten short statements that a person will agree or disagree with, one at a time, by leaning toward a camera or away from it.",
    topic.trim()
      ? `Topic: ${topic.trim().slice(0, 120)}. Every statement should be about this topic.`
      : "Pick an unexpected theme for the set yourself.",
    "Order them from small and everyday to the deepest questions. Statements 1 to 3 are light preferences that take no thought. Statements 4 to 7 are about people, values and how to live. Statements 8 to 10 must reach the biggest questions (death, meaning, morality, freedom, God), approached through the topic, and should be hard to answer honestly.",
    "Every statement must be one that thoughtful people split on, roughly half agreeing and half disagreeing. No platitudes everyone would agree with (like 'food brings people together' or 'kindness matters').",
    "Each statement is one plain, bold sentence under 14 words, a claim rather than a question, with no numbering, no 'I', and nothing that has a factual right answer.",
    `For example, a set about everything might run: ${examples.map((s) => `"${s}"`).join(", ")}. Do not reuse these.`,
    'Respond with only JSON: {"title": "two to four words naming the set", "statements": [ten strings]}.',
  ].join("\n");

  const response = await fetch(REPLICATE_PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: { prompt, temperature: 1, max_tokens: 700 } }),
  });
  const prediction = await response.json().catch(() => null);
  if (!response.ok || prediction?.status === "failed" || prediction?.error) {
    throw new Error(`The machine couldn't write a set (HTTP ${response.status}).`);
  }
  const text = Array.isArray(prediction.output) ? prediction.output.join("") : String(prediction.output ?? "");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("The machine's set couldn't be read.");
  const parsed = JSON.parse(match[0]);
  const statements = (parsed.statements ?? [])
    .map((s) => String(s).replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean)
    .map((s) => (/[.!?]$/.test(s) ? s : `${s}.`))
    .slice(0, 10);
  if (statements.length < 10) throw new Error("The machine wrote fewer than ten statements.");
  const title = String(parsed.title ?? "").trim().slice(0, 40) || (topic.trim() ? topic.trim() : "The machine's set");
  return { id: "machine", name: title, statements, byMachine: true };
}
