import type { EnvBindings } from "./db";
import { bundledTriviaQuestionBank } from "./trivia-fallback.generated";

export type ChallengeType = "compatibility" | "trivia";
export type ChallengeStatus =
  | "pending"
  | "accepted"
  | "canceled"
  | "declined"
  | "completed"
  | "expired";

export type CompatibilityQuestion = {
  id: string;
  prompt: string;
  options: string[];
};

export type TriviaQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctAnswerIndex: number;
  category: string;
  difficulty: "easy" | "medium";
};

export type ChallengeQuestion = CompatibilityQuestion | TriviaQuestion;

export type CompatibilityResult = {
  compatibilityPercent: number;
  matchedCount: number;
  matchedPrompts: Array<{ questionId: string; prompt: string; answer: string }>;
  mismatchedPrompts: Array<{
    questionId: string;
    prompt: string;
    senderAnswer: string;
    recipientAnswer: string;
  }>;
};

export type TriviaResult = {
  senderScore: number;
  recipientScore: number;
  maxScore: number;
  winner: "sender" | "recipient" | "tie";
  correctAnswers: Array<{
    questionId: string;
    prompt: string;
    answer: string;
    category: string;
  }>;
};

export const challengeSessionTtlMs = 1000 * 60 * 60 * 24 * 3;
export const challengeQuestionCount = 5;

export const compatibilityQuestionBank: CompatibilityQuestion[] = [
  { id: "pets", prompt: "Pick the better companion energy.", options: ["Dogs", "Cats", "Both", "Neither"] },
  { id: "weekend", prompt: "Best weekend plan?", options: ["Stay home", "Go out", "Short trip", "Anything spontaneous"] },
  { id: "night", prompt: "Your best hour to talk?", options: ["Morning", "Afternoon", "Late evening", "After midnight"] },
  { id: "flirting", prompt: "Best flirting style?", options: ["Playful teasing", "Soft and sweet", "Direct", "Slow and subtle"] },
  { id: "reply", prompt: "What feels best in chat?", options: ["Fast replies", "Thoughtful replies", "Voicey energy in text", "A mix of all three"] },
  { id: "dates", prompt: "More romantic to you?", options: ["Coffee and talking", "Dinner out", "Walk together", "Movie night in"] },
  { id: "music", prompt: "Pick a shared vibe starter.", options: ["Music", "Memes", "Deep questions", "Would-you-rather games"] },
  { id: "travel", prompt: "Travel energy?", options: ["Always ready", "Sometimes", "Only with the right person", "I love staying local"] },
  { id: "humor", prompt: "Humor you like most?", options: ["Dry", "Chaotic", "Flirty", "Warm and wholesome"] },
  { id: "pace", prompt: "Connection pace?", options: ["Instant spark", "Slow burn", "Depends on the vibe", "Friendly first"] },
  { id: "morning", prompt: "Pick one.", options: ["Sunrise plans", "Late breakfast", "Lazy afternoon", "Night drives"] },
  { id: "movies", prompt: "Movie pick?", options: ["Comedy", "Romance", "Thriller", "Fantasy"] },
  { id: "food", prompt: "Comfort food wins.", options: ["Pizza", "Pasta", "Sushi", "Dessert first"] },
  { id: "attention", prompt: "What feels sweetest?", options: ["Good morning text", "Random check-in", "Long late-night chat", "Remembering tiny details"] },
  { id: "conflict", prompt: "When tension happens, you prefer...", options: ["Talk it out fast", "Take a short pause", "Gentle reassurance first", "Humor to soften it"] },
  { id: "social", prompt: "Social battery?", options: ["Always high", "Balanced", "Low but loyal", "Changes with the person"] },
  { id: "planning", prompt: "Planning style?", options: ["Everything scheduled", "A loose plan", "Last-minute", "Let the other person lead"] },
  { id: "greenflag", prompt: "Biggest green flag?", options: ["Consistency", "Kindness", "Confidence", "Curiosity"] },
  { id: "voice", prompt: "Conversation tone?", options: ["Sweet", "Bold", "Mysterious", "Funny"] },
  { id: "gifts", prompt: "Small romantic gesture?", options: ["Flowers", "Playlist", "Food delivery", "A long message"] },
  { id: "weather", prompt: "Ideal weather vibe?", options: ["Sunny", "Rainy", "Cold", "Warm nights"] },
  { id: "talking", prompt: "Easier first topic?", options: ["Music", "Travel", "Childhood stories", "Unusual opinions"] },
  { id: "boundaries", prompt: "What matters most early on?", options: ["Respect", "Chemistry", "Consistency", "Humor"] },
  { id: "calls", prompt: "About calls later on...", options: ["Love them", "Sometimes", "Only after trust", "Prefer text"] },
  { id: "romcom", prompt: "Pick the better date-night energy.", options: ["Laugh together", "Deep talk", "Flirty chaos", "Comfort and calm"] },
  { id: "jealousy", prompt: "When you like someone, you become...", options: ["Protective", "Playful", "Calm", "More attentive"] },
  { id: "compliments", prompt: "Best compliment to receive?", options: ["You're smart", "You're beautiful", "You're easy to talk to", "You're unforgettable"] },
  { id: "sleep", prompt: "Sleep schedule truth?", options: ["Strictly early", "Mostly normal", "A little messy", "Hopeless night owl"] },
  { id: "adventure", prompt: "More fun with someone special?", options: ["Road trip", "Cooking together", "Arcade night", "Doing absolutely nothing"] },
  { id: "message", prompt: "A perfect opener is...", options: ["Funny", "Curious", "Flirty", "Unexpectedly sincere"] },
  { id: "vibe_031", prompt: "What makes a chat feel magnetic fast?", options: ["Playful banter", "Emotional honesty", "Strong curiosity", "Mutual teasing"] },
  { id: "vibe_032", prompt: "Your ideal first-night texting mood?", options: ["Soft and slow", "Energetic and nonstop", "A little mysterious", "Instantly deep"] },
  { id: "vibe_033", prompt: "Best shared silence?", options: ["Comfortable", "A little tense", "Flirty", "Only after trust"] },
  { id: "vibe_034", prompt: "Most attractive confidence?", options: ["Quiet confidence", "Bold confidence", "Protective confidence", "Playful confidence"] },
  { id: "vibe_035", prompt: "How do you show interest first?", options: ["Ask better questions", "Reply faster", "Tease a little", "Drop obvious hints"] },
  { id: "vibe_036", prompt: "What wins you over more?", options: ["Consistency", "Charm", "Attention", "Patience"] },
  { id: "vibe_037", prompt: "Your favorite kind of chemistry?", options: ["Calm and easy", "Hot and fast", "Sweet and steady", "Chaotic but fun"] },
  { id: "vibe_038", prompt: "What makes someone memorable in chat?", options: ["Their humor", "Their warmth", "Their depth", "Their confidence"] },
  { id: "vibe_039", prompt: "Best energy after midnight?", options: ["Deep thoughts", "Flirty nonsense", "Voice-note style texting", "Quiet comfort"] },
  { id: "vibe_040", prompt: "What feels more intimate?", options: ["Being understood", "Being wanted", "Being remembered", "Being chosen"] },
  { id: "vibe_041", prompt: "Pick the stronger first impression.", options: ["Gentle", "Magnetic", "Funny", "Elegant"] },
  { id: "vibe_042", prompt: "Which opener would you answer first?", options: ["A funny question", "A sweet compliment", "A bold take", "A random late-night thought"] },
  { id: "vibe_043", prompt: "What ruins chemistry quickest?", options: ["Dry replies", "Pushiness", "Mixed signals", "Being too performative"] },
  { id: "vibe_044", prompt: "What helps trust grow fastest?", options: ["Consistency", "Respect", "Clear intentions", "Gentle honesty"] },
  { id: "vibe_045", prompt: "Best pace for compliments?", options: ["Very early", "Once they feel earned", "Only if the vibe is mutual", "Scattered and random"] },
  { id: "vibe_046", prompt: "Pick your softer weakness.", options: ["Kindness", "Attention", "Voice-like texting", "Someone remembering details"] },
  { id: "vibe_047", prompt: "What do you notice first?", options: ["Tone", "Timing", "Effort", "Confidence"] },
  { id: "vibe_048", prompt: "Best kind of reassurance?", options: ["Words", "Consistency", "Check-ins", "Patience"] },
  { id: "vibe_049", prompt: "What makes a person feel safe?", options: ["Clear boundaries", "Steady replies", "Emotional maturity", "Warm humor"] },
  { id: "vibe_050", prompt: "Pick the better soft-launch energy.", options: ["Curious friend energy", "Open flirting", "Slow-burn tension", "Immediate obsession"] },
  { id: "vibe_051", prompt: "If someone likes you, you want them to be...", options: ["Obvious", "Subtle", "Steady", "A little possessive"] },
  { id: "vibe_052", prompt: "What is more attractive long term?", options: ["Reliability", "Mystery", "Emotional range", "Confidence under pressure"] },
  { id: "vibe_053", prompt: "Which reply style keeps you hooked?", options: ["Long and thoughtful", "Short but sharp", "Playful", "Soft and affectionate"] },
  { id: "vibe_054", prompt: "Pick the better tiny move.", options: ["Double text", "Random check-in", "Remembering your schedule", "A perfectly timed joke"] },
  { id: "vibe_055", prompt: "How much mystery is attractive?", options: ["A lot", "A little", "Only at first", "Almost none"] },
  { id: "vibe_056", prompt: "What gives strongest main-character energy?", options: ["Sharp wit", "Soft power", "Bold flirting", "Calm confidence"] },
  { id: "vibe_057", prompt: "What feels best during a slow day?", options: ["One thoughtful text", "Memes", "A teasing check-in", "No pressure silence"] },
  { id: "vibe_058", prompt: "Your favorite emotional tone?", options: ["Tender", "Playful", "Intense", "Balanced"] },
  { id: "vibe_059", prompt: "Pick the better mutual vibe.", options: ["Protective and sweet", "Funny and flirty", "Calm and loyal", "Wild and spontaneous"] },
  { id: "vibe_060", prompt: "What sounds most romantic?", options: ["I thought of you", "Get home safe", "Tell me more", "I saved this for you"] },
  { id: "vibe_061", prompt: "Best conversation recovery after awkwardness?", options: ["Laugh it off", "Address it gently", "Change the subject", "Send something sweet later"] },
  { id: "vibe_062", prompt: "How do you like affection to show up?", options: ["Verbally", "Through effort", "Through time", "Through humor"] },
  { id: "vibe_063", prompt: "Pick a more tempting date mood.", options: ["Cozy and private", "Dress up and go out", "Unexpected adventure", "Slow wandering"] },
  { id: "vibe_064", prompt: "What makes tension fun instead of stressful?", options: ["Mutual respect", "Good humor", "Clear attraction", "Knowing where you stand"] },
  { id: "vibe_065", prompt: "What reads as strongest loyalty?", options: ["Defending you", "Showing up", "Telling the truth", "Staying consistent"] },
  { id: "vibe_066", prompt: "Pick the better flirt escalation.", options: ["Soft teasing", "Obvious praise", "Low-key possessiveness", "Longer messages"] },
  { id: "vibe_067", prompt: "What keeps a connection from going flat?", options: ["Curiosity", "Surprise", "Routine check-ins", "Shared jokes"] },
  { id: "vibe_068", prompt: "Which energy would you miss more?", options: ["Someone grounding", "Someone exciting", "Someone gentle", "Someone deeply attentive"] },
  { id: "vibe_069", prompt: "How do you react to a very bold flirt?", options: ["Love it", "Depends on the tone", "Need warmth first", "Prefer subtlety"] },
  { id: "vibe_070", prompt: "What makes a chat feel exclusive?", options: ["Private jokes", "Daily rhythm", "Emotional honesty", "Being each other's first thought"] },
  { id: "vibe_071", prompt: "Best rainy-day togetherness?", options: ["Movies and blankets", "Cooking together", "Deep conversation", "Sleeping in"] },
  { id: "vibe_072", prompt: "Pick the better shared routine.", options: ["Morning text", "Nightly check-in", "Weekend ritual", "Random voice-like rambling"] },
  { id: "vibe_073", prompt: "What kind of planning feels romantic?", options: ["Detailed", "Loose but intentional", "Last-minute", "Surprise me"] },
  { id: "vibe_074", prompt: "Best food date mood?", options: ["Street food", "Fancy dinner", "Dessert crawl", "Order in and stay close"] },
  { id: "vibe_075", prompt: "What makes staying in feel special?", options: ["The conversation", "The comfort", "The flirting", "The feeling of being chosen"] },
  { id: "vibe_076", prompt: "Which trip sounds best with chemistry?", options: ["Cabin escape", "Big city weekend", "Beach reset", "Aimless road trip"] },
  { id: "vibe_077", prompt: "What time feels most romantic?", options: ["Golden hour", "Late night", "Rainy afternoon", "Sunrise after no sleep"] },
  { id: "vibe_078", prompt: "Pick the better date opening move.", options: ["Make them laugh", "Ask something real", "Compliment their eyes", "Match their energy"] },
  { id: "vibe_079", prompt: "What feels more couple-coded?", options: ["Shared routines", "Mutual teasing", "Soft public loyalty", "Knowing each other's moods"] },
  { id: "vibe_080", prompt: "Best homebody romance?", options: ["Cooking together", "Gaming together", "Reading near each other", "Doing nothing but talking"] },
  { id: "vibe_081", prompt: "What kind of surprise works best on you?", options: ["Tiny and thoughtful", "Big and dramatic", "Funny and weird", "Soft and romantic"] },
  { id: "vibe_082", prompt: "Pick the better first mini-date.", options: ["Coffee", "Late dessert", "Bookstore walk", "Night drive"] },
  { id: "vibe_083", prompt: "What matters most on a first meet?", options: ["Comfort", "Conversation", "Chemistry", "Attentiveness"] },
  { id: "vibe_084", prompt: "Best date follow-up text?", options: ["I had fun", "Get home safe", "You were trouble", "Still thinking about that moment"] },
  { id: "vibe_085", prompt: "What kind of environment helps chemistry?", options: ["Quiet and private", "Lively and social", "A little chaotic", "Anywhere with good lighting"] },
  { id: "vibe_086", prompt: "Pick the better shared habit.", options: ["Sending songs", "Sending photos of your day", "Trading questions", "Sending one-line flirt checks"] },
  { id: "vibe_087", prompt: "Which sounds more like a perfect escape?", options: ["Remote cabin", "Hotel in a busy city", "Beach apartment", "Somewhere with no plan at all"] },
  { id: "vibe_088", prompt: "What makes a date unforgettable?", options: ["Unexpected honesty", "Tension", "Laughter", "Feeling fully seen"] },
  { id: "vibe_089", prompt: "What kind of goodbye lingers longest?", options: ["A long look", "A sweet message later", "A private joke", "A promise to continue"] },
  { id: "vibe_090", prompt: "Pick the stronger everyday romance.", options: ["Checking if you ate", "Remembering your schedule", "Saving things you would like", "Making time when busy"] },
  { id: "vibe_091", prompt: "How much space feels healthy?", options: ["A lot", "A balanced amount", "Very little when chemistry is strong", "Depends on stress levels"] },
  { id: "vibe_092", prompt: "When you need quiet, you want someone to...", options: ["Give space without panic", "Stay soft and present", "Make you laugh", "Ask directly what you need"] },
  { id: "vibe_093", prompt: "What is the greenest boundary skill?", options: ["Saying no clearly", "Listening well", "Not rushing intimacy", "Respecting pace without sulking"] },
  { id: "vibe_094", prompt: "How do you prefer to reset after friction?", options: ["Talk soon", "Take a little time", "Receive reassurance first", "Send a soft opener"] },
  { id: "vibe_095", prompt: "What behavior feels most secure?", options: ["Clarity", "Patience", "Follow-through", "Gentle honesty"] },
  { id: "vibe_096", prompt: "Pick the better response to stress.", options: ["Stay steady", "Get sweeter", "Need space but explain it", "Use humor to lighten it"] },
  { id: "vibe_097", prompt: "What makes boundaries easier to trust?", options: ["Consistency", "Warmth", "Directness", "No mixed messages"] },
  { id: "vibe_098", prompt: "When someone is upset, what helps most?", options: ["Listening", "Solutions", "Reassurance", "Giving them room"] },
  { id: "vibe_099", prompt: "Which style feels more mature?", options: ["Calm honesty", "Strong passion", "Protective energy", "Low drama loyalty"] },
  { id: "vibe_100", prompt: "What boundary matters most in early attraction?", options: ["Respecting time", "Respecting pace", "Respecting tone", "Respecting no"] },
  { id: "vibe_101", prompt: "What kind of attention feels healthiest?", options: ["Steady", "Warm but not overwhelming", "Intense when mutual", "Light and playful"] },
  { id: "vibe_102", prompt: "Pick the better apology style.", options: ["Direct and clear", "Gentle and emotional", "Practical and changed behavior", "Soft and reassuring"] },
  { id: "vibe_103", prompt: "What makes reassurance believable?", options: ["Consistency", "Specific words", "Time", "Matching effort"] },
  { id: "vibe_104", prompt: "When someone needs reassurance often, you become...", options: ["Patient", "Softer", "Tired fast", "More careful with words"] },
  { id: "vibe_105", prompt: "Which trait calms your nervous system more?", options: ["Reliability", "Affection", "Humor", "Direct communication"] },
  { id: "vibe_106", prompt: "Pick the best sign of emotional safety.", options: ["You can be honest", "You can be quiet", "You can be messy", "You can ask for what you need"] },
  { id: "vibe_107", prompt: "When chemistry is strong, what can still ruin it?", options: ["Disrespect", "Inconsistency", "Ego", "Emotional unavailability"] },
  { id: "vibe_108", prompt: "What feels more caring?", options: ["Checking in gently", "Giving space without punishment", "Listening without fixing", "Following through later"] },
  { id: "vibe_109", prompt: "Which boundary style feels best?", options: ["Soft but clear", "Very direct", "Warm and collaborative", "Minimal but firm"] },
  { id: "vibe_110", prompt: "What do you value most during hard conversations?", options: ["Honesty", "Calm", "Kindness", "No defensiveness"] },
  { id: "vibe_111", prompt: "What kind of banter works best?", options: ["Quick and clever", "Soft and flirty", "A little chaotic", "Dry and subtle"] },
  { id: "vibe_112", prompt: "Pick the better shared joke energy.", options: ["Teasing each other lovingly", "Ridiculous nonsense", "Quietly clever", "Embarrassingly sweet"] },
  { id: "vibe_113", prompt: "What kind of funny person hooks you?", options: ["Sharp", "Goofy", "Unhinged but kind", "Deadpan"] },
  { id: "vibe_114", prompt: "How much teasing is ideal?", options: ["A lot", "A little", "Only if they are soft too", "Almost none"] },
  { id: "vibe_115", prompt: "What joke style feels flirtiest?", options: ["Mock confidence", "Fake jealousy", "Ridiculous sincerity", "Private references"] },
  { id: "vibe_116", prompt: "Pick the better vibe in a long chat.", options: ["Good pacing", "Good jokes", "Good tension", "Good honesty"] },
  { id: "vibe_117", prompt: "What makes someone feel naturally fun?", options: ["Curiosity", "Quick wit", "Randomness", "Warm chaos"] },
  { id: "vibe_118", prompt: "What kind of charm lasts longest?", options: ["Funny charm", "Quiet charm", "Protective charm", "Bold charm"] },
  { id: "vibe_119", prompt: "Which conversation detour do you enjoy most?", options: ["Conspiracy-level nonsense", "Childhood memories", "Deep emotional turns", "Flirt spirals"] },
  { id: "vibe_120", prompt: "Pick the better reason to stay up too late.", options: ["One more story", "One more joke", "One more honest answer", "One more flirt"] },
  { id: "vibe_121", prompt: "What kind of compliment lands hardest?", options: ["Unexpected", "Specific", "Public but tasteful", "Soft and private"] },
  { id: "vibe_122", prompt: "How obvious do you like attraction to be?", options: ["Very obvious", "Moderately obvious", "Only after mutual signs", "Barely obvious"] },
  { id: "vibe_123", prompt: "Pick the sweeter kind of clingy.", options: ["Wants your time", "Wants your attention", "Wants reassurance", "Wants your routine"] },
  { id: "vibe_124", prompt: "What type of attention feels addictive?", options: ["Focused", "Protective", "Playful", "Emotionally tuned in"] },
  { id: "vibe_125", prompt: "What makes praise believable?", options: ["They notice details", "They do not overdo it", "Their actions match", "They say it naturally"] },
  { id: "vibe_126", prompt: "Pick the best post-compliment reaction.", options: ["Tease back", "Get shy", "Say something sweeter", "Pretend it did not matter"] },
  { id: "vibe_127", prompt: "How do you like someone to miss you?", options: ["Say it directly", "Show it through effort", "Hint at it playfully", "Return softer than usual"] },
  { id: "vibe_128", prompt: "What kind of attraction builds strongest?", options: ["Mutual curiosity", "Mutual softness", "Mutual obsession", "Mutual respect first"] },
  { id: "vibe_129", prompt: "Pick the more dangerous charm.", options: ["Too observant", "Too funny", "Too calm", "Too intentionally kind"] },
  { id: "vibe_130", prompt: "What sign of interest feels best?", options: ["They make time", "They remember things", "They get playful", "They get gentler"] },
  { id: "vibe_131", prompt: "How do you prefer jealousy to show up?", options: ["Barely at all", "Playfully", "Protectively", "Only through honesty"] },
  { id: "vibe_132", prompt: "What kind of possessive is still cute?", options: ["Wants updates", "Claims private jokes", "Pulls you closer emotionally", "None of it"] },
  { id: "vibe_133", prompt: "What makes devotion feel real?", options: ["Reliability", "Priority", "Gentleness", "Attention to details"] },
  { id: "vibe_134", prompt: "Pick the stronger loyalty test.", options: ["Busy day", "Misunderstanding", "Distance", "Tempting alternatives"] },
  { id: "vibe_135", prompt: "When you start caring, you become...", options: ["More protective", "More available", "More curious", "More obvious"] },
  { id: "vibe_136", prompt: "What does your soft spot respond to?", options: ["Neediness", "Calm confidence", "Earnest honesty", "A little jealousy"] },
  { id: "vibe_137", prompt: "Pick the better signal that someone is attached.", options: ["They check on you", "They remember patterns", "They open up more", "They get more playful"] },
  { id: "vibe_138", prompt: "What feels more exclusive?", options: ["Daily rituals", "Special nicknames", "Protective attention", "Shared secrets"] },
  { id: "vibe_139", prompt: "How important is being prioritized?", options: ["Very", "Pretty", "Only after time", "Less than being respected"] },
  { id: "vibe_140", prompt: "What kind of emotional pull is strongest?", options: ["Safe pull", "Hot pull", "Curious pull", "Soft pull"] },
  { id: "vibe_141", prompt: "Pick the better fantasy energy.", options: ["Powerful but gentle", "Dangerous but loyal", "Smart and obsessive", "Playful and devoted"] },
  { id: "vibe_142", prompt: "What kind of role draws you in more?", options: ["Protective", "Teasing", "Emotionally intense", "Calmly leading the vibe"] },
  { id: "vibe_143", prompt: "Which dynamic sounds most fun?", options: ["Chaos and calm", "Brains and flirt", "Sweet and sharp", "Two shameless flirts"] },
  { id: "vibe_144", prompt: "Pick the stronger fictional attraction trait.", options: ["Competence", "Devotion", "Mystery", "Wit"] },
  { id: "vibe_145", prompt: "What makes an imagined dynamic believable?", options: ["Consistent tone", "Clear chemistry", "Good boundaries", "Shared tension"] },
  { id: "vibe_146", prompt: "Which fantasy vibe feels hottest?", options: ["Forbidden softness", "Slow obsession", "Protective teasing", "Mutual total commitment to the bit"] },
  { id: "vibe_147", prompt: "Pick the better dramatic energy.", options: ["Yearning", "Banter", "Devotion", "Possession without cruelty"] },
  { id: "vibe_148", prompt: "What kind of imagined bond feels strongest?", options: ["Ride-or-die", "Quietly devoted", "Chaotic soulmates", "Soft enemies to lovers"] },
  { id: "vibe_149", prompt: "How serious should fantasy energy feel?", options: ["Very", "Somewhat", "Just enough to be fun", "Mostly playful"] },
  { id: "vibe_150", prompt: "What makes a dynamic replayable?", options: ["Good tension", "Strong contrast", "Emotional payoff", "Shared humor"] },
  { id: "vibe_151", prompt: "What routine says 'I like you' best?", options: ["Good morning text", "Night check-in", "Sharing music", "Sending little updates"] },
  { id: "vibe_152", prompt: "Best time for a sweet interruption?", options: ["During work", "Late at night", "During a boring errand", "Any time if it is brief"] },
  { id: "vibe_153", prompt: "How much everyday access feels right?", options: ["A lot", "A healthy middle", "Very little at first", "Depends on chemistry"] },
  { id: "vibe_154", prompt: "What feels better over time?", options: ["Predictable warmth", "Ongoing surprise", "Deeper honesty", "More flirt once trust is built"] },
  { id: "vibe_155", prompt: "Pick the better sleepy message.", options: ["Talk tomorrow", "Wish you were here", "You made my night better", "Do not disappear on me"] },
  { id: "vibe_156", prompt: "What small thing means the most?", options: ["They noticed your mood", "They remembered a detail", "They made time", "They softened their tone for you"] },
  { id: "vibe_157", prompt: "What kind of everyday support matters most?", options: ["Encouragement", "Presence", "Humor", "Practical help"] },
  { id: "vibe_158", prompt: "Pick the better ordinary intimacy.", options: ["Parallel routines", "Daily updates", "Shared playlists", "Private jokes all day"] },
  { id: "vibe_159", prompt: "Which message would you reread?", options: ["One that gets you", "One that wants you", "One that chooses you", "One that calms you"] },
  { id: "vibe_160", prompt: "What makes consistency feel romantic instead of boring?", options: ["Warmth", "Variety inside the routine", "Mutual effort", "A little flirt every time"] },
  { id: "vibe_161", prompt: "What kind of mind attracts you most?", options: ["Curious", "Strategic", "Creative", "Emotionally intelligent"] },
  { id: "vibe_162", prompt: "Pick the more attractive confidence flex.", options: ["Knows what they want", "Never chases validation", "Can stay soft", "Pays attention without trying hard"] },
  { id: "vibe_163", prompt: "What type of depth feels best?", options: ["Emotional depth", "Intellectual depth", "Moral depth", "Observational depth"] },
  { id: "vibe_164", prompt: "Which trait ages best?", options: ["Kindness", "Self-control", "Curiosity", "Humor"] },
  { id: "vibe_165", prompt: "What kind of thoughtfulness hits hardest?", options: ["Remembering specifics", "Anticipating your needs", "Asking better questions", "Following up later"] },
  { id: "vibe_166", prompt: "Pick the better rare quality.", options: ["Patience", "Strong communication", "Actual softness", "Consistency under pressure"] },
  { id: "vibe_167", prompt: "What makes someone feel high-value to you?", options: ["Integrity", "Emotional steadiness", "Presence", "Confidence without arrogance"] },
  { id: "vibe_168", prompt: "How much intelligence matters in attraction?", options: ["A lot", "A fair amount", "Mostly emotional intelligence", "Only if it comes with warmth"] },
  { id: "vibe_169", prompt: "Pick the more seductive trait.", options: ["Discipline", "Attentiveness", "Gentle authority", "Sharp humor"] },
  { id: "vibe_170", prompt: "What kind of self-awareness is most attractive?", options: ["Knowing your flaws", "Knowing your pace", "Knowing your boundaries", "Knowing how you affect people"] },
  { id: "vibe_171", prompt: "When you like someone, your texting becomes...", options: ["Faster", "Softer", "Longer", "More teasing"] },
  { id: "vibe_172", prompt: "What reply delay feels natural?", options: ["Almost immediate", "Within a little while", "Whenever life allows", "It depends on the tone"] },
  { id: "vibe_173", prompt: "What kind of text feels most alive?", options: ["Detailed", "Messy and real", "Sharp and funny", "Quietly intimate"] },
  { id: "vibe_174", prompt: "Pick the more dangerous habit.", options: ["Late-night honesty", "Double texting", "Getting attached to routines", "Saving screenshots mentally"] },
  { id: "vibe_175", prompt: "What is better than a good opener?", options: ["A good follow-up", "A good comeback", "A good memory", "A good sense of timing"] },
  { id: "vibe_176", prompt: "How should chemistry evolve in chat?", options: ["From light to deep", "From sweet to bold", "From curious to consistent", "All of the above"] },
  { id: "vibe_177", prompt: "What kind of message feels most intimate to send?", options: ["A confession", "A check-in", "A compliment", "A vulnerable admission"] },
  { id: "vibe_178", prompt: "Pick the better texting weakness.", options: ["Overexplaining", "Oversharing a little", "Getting too soft", "Staying up too late"] },
  { id: "vibe_179", prompt: "What makes a thread worth reopening?", options: ["Unfinished tension", "A shared joke", "A thoughtful answer", "A little bit of longing"] },
  { id: "vibe_180", prompt: "What kind of message would you send first tomorrow?", options: ["Something funny", "Something sweet", "Something curious", "Something a little dangerous"] },
  { id: "vibe_181", prompt: "Which energy do you bring when you feel safe?", options: ["More playful", "More affectionate", "More honest", "More clingy"] },
  { id: "vibe_182", prompt: "What do you secretly enjoy more than you admit?", options: ["Attention", "Reassurance", "Possessive teasing", "Being understood"] },
  { id: "vibe_183", prompt: "Pick the stronger emotional pull.", options: ["They calm you", "They excite you", "They understand you", "They choose you repeatedly"] },
  { id: "vibe_184", prompt: "What makes attraction feel mutual?", options: ["Matching effort", "Matching tone", "Matching curiosity", "Matching softness"] },
  { id: "vibe_185", prompt: "What version of you shows up when chemistry is real?", options: ["Softer", "Braver", "Funnier", "More obvious"] },
  { id: "vibe_186", prompt: "What kind of sweetness gets you every time?", options: ["Earnest sweetness", "Playful sweetness", "Protective sweetness", "Unexpected sweetness"] },
  { id: "vibe_187", prompt: "Pick the better sign of comfort.", options: ["No need to perform", "No fear of silence", "No confusion about tone", "No pressure to rush"] },
  { id: "vibe_188", prompt: "What kind of attraction matures best?", options: ["Soft and steady", "Slow and deep", "Playful and loyal", "Bold but respectful"] },
  { id: "vibe_189", prompt: "What gets stronger with time for you?", options: ["Attachment", "Trust", "Flirting", "Need for closeness"] },
  { id: "vibe_190", prompt: "Pick the better word for your ideal connection.", options: ["Intentional", "Magnetic", "Safe", "Addictive"] },
  { id: "vibe_191", prompt: "Which aftercare of a good chat matters most?", options: ["A sweet goodbye", "A promise to continue", "A soft check-in later", "A little lingering tension"] },
  { id: "vibe_192", prompt: "How do you like to feel after talking to someone?", options: ["Calmer", "More wanted", "More curious", "A little undone in a good way"] },
  { id: "vibe_193", prompt: "What kind of match feels rarest?", options: ["Same humor", "Same pace", "Same emotional style", "Same appetite for depth"] },
  { id: "vibe_194", prompt: "What keeps you coming back to a person?", options: ["The safety", "The tension", "The consistency", "The way they notice you"] },
  { id: "vibe_195", prompt: "Pick the better chemistry warning sign.", options: ["Too much too fast", "Too charming too early", "Too inconsistent", "Too emotionally closed off"] },
  { id: "vibe_196", prompt: "What kind of mutuality matters most?", options: ["Mutual effort", "Mutual respect", "Mutual attraction", "Mutual softness"] },
  { id: "vibe_197", prompt: "If someone gets your vibe, what do they understand?", options: ["Your pace", "Your boundaries", "Your humor", "All of it together"] },
  { id: "vibe_198", prompt: "What kind of person makes you feel the most seen?", options: ["Observant", "Emotionally present", "Patient", "Quietly devoted"] },
  { id: "vibe_199", prompt: "What kind of closeness feels best?", options: ["Easy and constant", "Rare but intense", "Soft and chosen", "Playful and private"] },
  { id: "vibe_200", prompt: "What is the best ending for a great Vibe Check?", options: ["Start chatting immediately", "Keep teasing a little", "Trade one honest answer", "Want a second round"] },
];

export const triviaQuestionBank = bundledTriviaQuestionBank as TriviaQuestion[];

type TriviaQuestionRow = {
  id: string;
  prompt: string;
  options: string;
  correct_answer_index: number;
  difficulty: string;
  category: string;
};

function shuffleInPlace<T>(items: T[]) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = items[index];
    items[index] = items[swapIndex];
    items[swapIndex] = current;
  }

  return items;
}

function selectFromBank<T extends { id: string }>(
  bank: T[],
  recentQuestionIds: string[],
  count = challengeQuestionCount,
) {
  const recentSet = new Set(recentQuestionIds);
  const fresh = bank.filter((question) => !recentSet.has(question.id));
  const fallback = bank.filter((question) => recentSet.has(question.id));
  const selectionPool = shuffleInPlace([...fresh]);

  while (selectionPool.length < count) {
    const next = shuffleInPlace([...fallback]).find(
      (question) => !selectionPool.some((item) => item.id === question.id),
    );
    if (!next) {
      break;
    }

    selectionPool.push(next);
  }

  return selectionPool.slice(0, count);
}

export function selectCompatibilityQuestions(
  recentQuestionIds: string[],
  count = challengeQuestionCount,
) {
  return selectFromBank(compatibilityQuestionBank, recentQuestionIds, count);
}

function selectTriviaQuestionsFromFallback(
  recentQuestionIds: string[],
  count = challengeQuestionCount,
) {
  return selectFromBank(triviaQuestionBank, recentQuestionIds, count);
}

function normalizeTriviaQuestionRow(row: TriviaQuestionRow): TriviaQuestion | null {
  if (row.difficulty !== "easy" && row.difficulty !== "medium") {
    return null;
  }

  let options: string[];
  try {
    options = JSON.parse(row.options) as string[];
  } catch {
    return null;
  }

  if (!Array.isArray(options) || options.length !== 4 || options.some((option) => typeof option !== "string")) {
    return null;
  }

  if (row.correct_answer_index < 0 || row.correct_answer_index >= options.length) {
    return null;
  }

  return {
    id: row.id,
    prompt: row.prompt,
    options,
    correctAnswerIndex: row.correct_answer_index,
    category: row.category,
    difficulty: row.difficulty,
  };
}

export async function selectTriviaQuestions(
  env: EnvBindings,
  recentQuestionIds: string[],
  count = challengeQuestionCount,
) {
  const recentIds = Array.from(new Set(recentQuestionIds)).slice(0, 200);
  const placeholders = recentIds.map(() => "?").join(", ");
  const exclusionClause =
    recentIds.length > 0 ? `WHERE id NOT IN (${placeholders}) AND difficulty IN ('easy', 'medium')` : "WHERE difficulty IN ('easy', 'medium')";

  const freshStatement = env.DB.prepare(
    `SELECT id, prompt, options, correct_answer_index, difficulty, category
     FROM trivia_questions
     ${exclusionClause}
     ORDER BY RANDOM()
     LIMIT ?`,
  ).bind(...recentIds, count);

  const fallbackStatement = env.DB.prepare(
    `SELECT id, prompt, options, correct_answer_index, difficulty, category
     FROM trivia_questions
     WHERE difficulty IN ('easy', 'medium')
     ORDER BY RANDOM()
     LIMIT ?`,
  ).bind(count * 4);

  const freshRows = await freshStatement.all<TriviaQuestionRow>();
  const fallbackRows = await fallbackStatement.all<TriviaQuestionRow>();
  const candidates = [
    ...(freshRows.results ?? []),
    ...(fallbackRows.results ?? []),
  ]
    .map(normalizeTriviaQuestionRow)
    .filter((question): question is TriviaQuestion => Boolean(question));

  const unique = new Map<string, TriviaQuestion>();
  for (const question of candidates) {
    if (!unique.has(question.id)) {
      unique.set(question.id, question);
    }
    if (unique.size >= count) {
      break;
    }
  }

  if (unique.size >= count) {
    return Array.from(unique.values()).slice(0, count);
  }

  return selectTriviaQuestionsFromFallback(recentQuestionIds, count);
}

export function computeCompatibilityResult(
  questions: CompatibilityQuestion[],
  senderAnswers: number[],
  recipientAnswers: number[],
): CompatibilityResult {
  const matchedPrompts: CompatibilityResult["matchedPrompts"] = [];
  const mismatchedPrompts: CompatibilityResult["mismatchedPrompts"] = [];

  questions.forEach((question, index) => {
    const senderAnswerIndex = senderAnswers[index] ?? -1;
    const recipientAnswerIndex = recipientAnswers[index] ?? -1;
    const senderAnswer = question.options[senderAnswerIndex] ?? "Skipped";
    const recipientAnswer = question.options[recipientAnswerIndex] ?? "Skipped";

    if (senderAnswerIndex === recipientAnswerIndex && senderAnswerIndex >= 0) {
      matchedPrompts.push({
        questionId: question.id,
        prompt: question.prompt,
        answer: senderAnswer,
      });
      return;
    }

    mismatchedPrompts.push({
      questionId: question.id,
      prompt: question.prompt,
      senderAnswer,
      recipientAnswer,
    });
  });

  const compatibilityPercent =
    questions.length > 0 ? Math.round((matchedPrompts.length / questions.length) * 100) : 0;

  return {
    compatibilityPercent,
    matchedCount: matchedPrompts.length,
    matchedPrompts,
    mismatchedPrompts,
  };
}

export function computeTriviaScore(
  questions: TriviaQuestion[],
  answers: number[],
) {
  return questions.reduce((score, question, index) => {
    return score + (answers[index] === question.correctAnswerIndex ? 1 : 0);
  }, 0);
}

export function computeTriviaResult(
  questions: TriviaQuestion[],
  senderScore: number,
  recipientScore: number,
): TriviaResult {
  return {
    senderScore,
    recipientScore,
    maxScore: questions.length,
    winner:
      senderScore === recipientScore
        ? "tie"
        : senderScore > recipientScore
          ? "sender"
          : "recipient",
    correctAnswers: questions.map((question) => ({
      questionId: question.id,
      prompt: question.prompt,
      answer: question.options[question.correctAnswerIndex] ?? "Unknown",
      category: question.category,
    })),
  };
}

export function getChallengeInviteMessage(
  senderName: string,
  type: ChallengeType,
) {
  if (type === "compatibility") {
    return `${senderName} sent you a Vibe Check.`;
  }

  return `${senderName} sent you a Trivia Challenge.`;
}
