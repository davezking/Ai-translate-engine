/* =============================================================================
   Mock data for the UI prototype.
   Shapes mirror architecture.md §4 (D1 tables) and §5 (API responses) so the
   React port can swap this file for real `/api/*` fetches with no UI changes.
   ============================================================================= */

const NOW = Date.parse('2026-08-31T09:00:00Z');
const DAY = 86400000;

const DB = {
  user: { id: 'u_1', email: 'dave@example.com', role: 'admin' },

  /* --- articles ---------------------------------------------------------- */
  articles: [
    {
      id: 'art_9fa21c', title: 'Ethiopia’s coffee exports reach a record high',
      status: 'translating', writer_style_id: 'sty_1', fix_count: null,
      created_at: NOW - 2 * 3600e3, updated_at: NOW - 12 * 60e3,
      words: 742, chunks: 4
    },
    {
      id: 'art_7c0e13', title: 'The new light-rail corridor and what it changes',
      status: 'translating', writer_style_id: 'sty_1', fix_count: null,
      created_at: NOW - 5 * 3600e3, updated_at: NOW - 40 * 60e3,
      words: 1180, chunks: 2
    },
    {
      id: 'art_5b8d40', title: 'Smallholder irrigation pilots in the Rift Valley',
      status: 'final', writer_style_id: 'sty_1', fix_count: 6,
      created_at: NOW - 2 * DAY, updated_at: NOW - 2 * DAY + 4 * 3600e3,
      words: 890, chunks: 3
    },
    {
      id: 'art_31a7f9', title: 'Why the birr’s float is reshaping import pricing',
      status: 'final', writer_style_id: 'sty_2', fix_count: 8,
      created_at: NOW - 4 * DAY, updated_at: NOW - 4 * DAY + 5 * 3600e3,
      words: 1320, chunks: 4
    },
    {
      id: 'art_88c2b5', title: 'A quiet boom in Addis software services',
      status: 'final', writer_style_id: 'sty_1', fix_count: 11,
      created_at: NOW - 7 * DAY, updated_at: NOW - 7 * DAY + 3 * 3600e3,
      words: 960, chunks: 3
    },
    {
      id: 'art_44de71', title: 'Teff yields after two seasons of new seed stock',
      status: 'final', writer_style_id: 'sty_2', fix_count: 14,
      created_at: NOW - 11 * DAY, updated_at: NOW - 11 * DAY + 6 * 3600e3,
      words: 1040, chunks: 3
    },
    {
      id: 'art_2ff903', title: 'Grid expansion reaches the eastern districts',
      status: 'final', writer_style_id: 'sty_1', fix_count: 17,
      created_at: NOW - 15 * DAY, updated_at: NOW - 15 * DAY + 4 * 3600e3,
      words: 780, chunks: 3
    },
    {
      id: 'art_1ab662', title: 'What the tourism reopening means for regional hotels',
      status: 'final', writer_style_id: 'sty_2', fix_count: 19,
      created_at: NOW - 19 * DAY, updated_at: NOW - 19 * DAY + 5 * 3600e3,
      words: 1150, chunks: 4
    },
    {
      id: 'art_0c9d18', title: 'The long road to a national digital ID',
      status: 'final', writer_style_id: 'sty_1', fix_count: 22,
      created_at: NOW - 24 * DAY, updated_at: NOW - 24 * DAY + 7 * 3600e3,
      words: 1420, chunks: 4
    },
    {
      id: 'art_6e5540', title: 'Cement supply and the construction slowdown',
      status: 'final', writer_style_id: 'sty_1', fix_count: 24,
      created_at: NOW - 28 * DAY, updated_at: NOW - 28 * DAY + 4 * 3600e3,
      words: 830, chunks: 3
    },
    {
      id: 'art_c31882', title: 'Draft: notes on the fertiliser subsidy debate',
      status: 'drafted', writer_style_id: null, fix_count: null,
      created_at: NOW - 30 * 60e3, updated_at: NOW - 30 * 60e3,
      words: 0, chunks: 0
    }
  ],

  /* --- chunks for the focus article -------------------------------------- */
  chunks: {
    art_9fa21c: [
      {
        ord: 1, status: 'done', words: 196,
        english_text: 'Ethiopia’s coffee exports reached a record 1.4 billion dollars in the last fiscal year, the Coffee and Tea Authority said on Tuesday, a figure that puts the sector well ahead of the target set at the start of the period. Officials attributed the rise to a combination of higher global prices, tighter controls on contraband movement across the western border, and a push to register smallholder washing stations that had previously sold into informal channels. The authority said volumes grew more modestly than value, an indication that the country is capturing more of each shipment’s worth rather than simply shipping more sacks.',
        amharic_text: 'የኢትዮጵያ ቡና ወጪ ንግድ ባለፈው የበጀት ዓመት 1.4 ቢሊዮን ዶላር ደርሶ ሪከርድ መስበሩን የቡናና ሻይ ባለሥልጣን ማክሰኞ ዕለት አስታውቋል፤ ይህም አኃዝ ዘርፉ በዓመቱ መጀመሪያ ከተቀመጠለት ግብ በእጅጉ የላቀ ያደርገዋል። ባለሥልጣናቱ ለዕድገቱ ምክንያት ያሉት የዓለም አቀፍ ዋጋ መጨመርን፣ በምዕራቡ ድንበር በኩል የሚደረገውን ኮንትሮባንድ ንግድ ለመግታት የተጣለውን ጥብቅ ቁጥጥርን፣ እንዲሁም ቀደም ሲል በኢመደበኛ መንገድ ይሸጡ የነበሩ የአነስተኛ አርሶ አደሮች የቡና ማጠቢያ ጣቢያዎችን የመመዝገብ ሥራን ነው። ባለሥልጣኑ እንዳለው የመጠን ዕድገቱ ከዋጋው ዕድገት ያነሰ ነው፤ ይህ ደግሞ አገሪቱ በርካታ ጆንያ ከመላክ ይልቅ ከእያንዳንዱ ጭነት የበለጠ ጥቅም እያገኘች መሆኑን ያመለክታል።'
      },
      {
        ord: 2, status: 'done', words: 188,
        english_text: 'The gains have not been evenly shared. Cooperatives in Jimma and Sidama, which invested early in wet-mill upgrades and traceability paperwork, captured most of the premium contracts. Producers in newer growing districts still sell largely through intermediaries and see a fraction of the export price. A trader in Bonga described the gap plainly: two farmers a valley apart, the same cherry quality, and a price difference of nearly forty percent depending on whether the lot could be documented back to a registered station.',
        amharic_text: 'ሆኖም ጥቅሙ በእኩል አልተከፋፈለም። በጅማና በሲዳማ የሚገኙ ኅብረት ሥራ ማኅበራት በእርጥብ ማቀነባበሪያ ማሻሻያና በተከታታይነት ማረጋገጫ ሰነዶች ላይ ቀድመው ኢንቨስት በማድረጋቸው አብዛኞቹን ተመራጭ ውሎች ወስደዋል። በአዲስ የቡና አብቃይ ወረዳዎች የሚገኙ አምራቾች ግን አሁንም በአብዛኛው በደላሎች በኩል ይሸጣሉ፤ ከወጪ ንግዱ ዋጋም የሚደርሳቸው ጥቂት ድርሻ ብቻ ነው። በቦንጋ የሚገኝ አንድ ነጋዴ ልዩነቱን በግልጽ እንዲህ ሲል ገለጸው፦ በአንድ ሸለቆ ልዩነት የሚገኙ ሁለት አርሶ አደሮች፣ ተመሳሳይ የቡና ፍሬ ጥራት ይዘው፣ ምርቱ ወደተመዘገበ ጣቢያ መመለስ ይችል እንደሆነ ብቻ በመወሰን የዋጋ ልዩነታቸው ወደ አርባ በመቶ ይደርሳል።'
      },
      {
        ord: 3, status: 'pending', words: 201,
        english_text: 'Logistics remain the weakest link. Containers still queue for days at the dry port, and exporters say the cost of a delayed shipment can erase the margin on an entire lot. The authority has promised a booking system that would give registered exporters a guaranteed slot, but no launch date has been published. Meanwhile, a shortage of certified graders means samples sometimes wait a week before cupping, and buyers abroad increasingly ask for turnaround guarantees that Ethiopian sellers cannot yet make.',
        amharic_text: ''
      },
      {
        ord: 4, status: 'failed', words: 157,
        english_text: 'What happens next depends less on price than on paperwork. If the registration drive reaches the newer districts before the next harvest, the premium now concentrated in two zones could spread. If it stalls, the record will read as a good year for a narrow group of producers rather than a structural gain for the sector.',
        amharic_text: '',
        error: 'Gemini API returned 503 (model overloaded). Chunk left untouched — retry is safe.'
      }
    ]
  },

  /* --- retrieved lessons (Vectorize top-N) -------------------------------- */
  lessons: [
    { id: 'cor_a71', score: 0.91, topic_tag: 'economy/trade',
      summary: 'Institution names were translated literally instead of using the established Amharic official name. Check whether a government body has a published Amharic name before rendering it word-by-word.' },
    { id: 'cor_b34', score: 0.88, topic_tag: 'register',
      summary: 'Machine output used "ተደርጓል" passive constructions in three places where the writer prefers an active subject. Prefer active voice when the actor is named in the English sentence.' },
    { id: 'cor_c02', score: 0.84, topic_tag: 'numbers',
      summary: 'Large figures were written in Ge’ez numerals in the draft; house style keeps Arabic numerals for currency and volumes, spelling out only ordinals under ten.' },
    { id: 'cor_d55', score: 0.79, topic_tag: 'idiom',
      summary: '"Weakest link" was rendered word-for-word and read oddly. Idioms should be replaced with an equivalent Amharic expression rather than calqued.' },
    { id: 'cor_e18', score: 0.76, topic_tag: 'punctuation',
      summary: 'Sentence-final punctuation used the Latin period instead of ፡፡/።. Use Ethiopic punctuation consistently, including in quoted speech.' }
  ],

  /* --- corrections library ------------------------------------------------ */
  corrections_total: 68,
  corrections_seeded: 52,

  /* --- style profiles ----------------------------------------------------- */
  styles: [
    { id: 'sty_1', writer_name: 'Selam T.', approved: 1, created_at: NOW - 20 * DAY, samples: 4,
      derived_guidelines: `Register: formal newsroom Amharic, never conversational. Addresses the reader as an informed general audience, not a specialist.

Sentence rhythm: mostly medium-length sentences (18–28 words) with one short declarative every third or fourth sentence for emphasis. Avoids chains of subordinate clauses.

Voice: prefers an active subject wherever the English names an actor. Passive constructions are reserved for cases where the actor is genuinely unknown.

Vocabulary: uses established Amharic terminology for institutions and economic concepts rather than transliterated English. Transliteration is acceptable only for product names and units with no settled Amharic equivalent.

Attribution: places the source before the claim ("ባለሥልጣኑ እንዳስታወቀው…") rather than trailing it.

Numbers and punctuation: Arabic numerals for figures, currency and volumes; ordinals under ten spelled out. Ethiopic sentence punctuation (።) throughout, including inside quotations.` },
    { id: 'sty_2', writer_name: 'Abel M.', approved: 1, created_at: NOW - 13 * DAY, samples: 3,
      derived_guidelines: `Register: analytical and slightly more literary than straight news. Comfortable opening a piece with a scene or an image before stating the news.

Sentence rhythm: greater variation than a news writer — long expository sentences balanced by very short ones. Uses the colon to introduce examples.

Voice: frequently foregrounds consequence over event ("what this changes" before "what happened").

Vocabulary: richer verb choice; avoids repeating the same verb within a paragraph. Comfortable with idiomatic Amharic expressions where the English uses an idiom.

Attribution: attributes at the end of the sentence, keeping the claim in front.

Numbers and punctuation: same house conventions as the newsroom style.` },
    { id: 'sty_3', writer_name: 'Feature desk (draft)', approved: 0, created_at: NOW - 2 * DAY, samples: 2,
      derived_guidelines: `Register: long-form feature voice. Frequently uses direct quotation as a paragraph opener.

Sentence rhythm: longer average sentence length; paragraph breaks used for pacing rather than topic change.

Voice: heavy use of the narrative past; present tense reserved for standing facts.

Vocabulary: descriptive adjectives are used sparingly and deliberately — one per sentence at most.

Attribution: woven into the narrative rather than formally stated.

Numbers and punctuation: figures often spelled out in feature context where a news piece would use numerals.` }
  ],

  /* --- prompts + version history ------------------------------------------ */
  prompts: {
    split: {
      key: 'split', current: 3, label: 'Split',
      description: 'Divides pasted English into quality-sized, boundary-safe chunks.',
      versions: [
        { v: 3, author: 'dave@example.com', created_at: NOW - 6 * DAY, note: 'Raised target size to 500–800 words; forbade mid-quote breaks.',
          body: 'You split English articles into translation chunks.\n\nRules:\n- Target 500–800 words per chunk; never exceed 900.\n- Break only at paragraph boundaries. Never split inside a quotation, a list, or a sentence.\n- Keep a heading with the section it introduces.\n- Return JSON: { "chunks": [{ "ord": 1, "text": "..." }] } and nothing else.' },
        { v: 2, author: 'dave@example.com', created_at: NOW - 17 * DAY, note: 'Added JSON-only output constraint.',
          body: 'You split English articles into translation chunks.\n\nRules:\n- Target 400–600 words per chunk.\n- Break at paragraph boundaries where possible.\n- Return JSON: { "chunks": [{ "ord": 1, "text": "..." }] } and nothing else.' },
        { v: 1, author: 'dave@example.com', created_at: NOW - 29 * DAY, note: 'Initial version.',
          body: 'Split the following article into chunks of roughly 400 words each, breaking at paragraphs.' }
      ]
    },
    translate: {
      key: 'translate', current: 4, label: 'Translate',
      description: 'Translates one English chunk into Amharic. Called once per chunk, retryable.',
      versions: [
        { v: 4, author: 'dave@example.com', created_at: NOW - 3 * DAY, note: 'Told the model to keep untranslatable proper nouns in Latin script.',
          body: 'Translate the English text below into Amharic (Ge’ez script).\n\nRules:\n- Produce natural Amharic prose, not a word-for-word rendering.\n- Preserve paragraph breaks exactly.\n- Keep proper nouns with no established Amharic form in Latin script.\n- Use Ethiopic sentence punctuation (።).\n- Output only the Amharic translation. No preamble, no notes.' },
        { v: 3, author: 'dave@example.com', created_at: NOW - 12 * DAY, note: 'Added punctuation rule after reviewer feedback.',
          body: 'Translate the English text below into Amharic (Ge’ez script).\n\nRules:\n- Natural Amharic prose, not word-for-word.\n- Preserve paragraph breaks.\n- Use Ethiopic sentence punctuation (።).\n- Output only the translation.' },
        { v: 2, author: 'dave@example.com', created_at: NOW - 22 * DAY, note: 'Removed the “explain your choices” instruction — it polluted output.',
          body: 'Translate the English text below into Amharic. Preserve paragraph breaks. Output only the translation.' },
        { v: 1, author: 'dave@example.com', created_at: NOW - 29 * DAY, note: 'Initial version.',
          body: 'Translate the following text into Amharic and briefly explain your word choices.' }
      ]
    },
    qa: {
      key: 'qa', current: 6, label: 'QA',
      description: 'Fixes grammar, wording and MT stiffness; applies the style profile and retrieved lessons.',
      versions: [
        { v: 6, author: 'dave@example.com', created_at: NOW - 1 * DAY, note: 'Ordered lessons above style guidelines; lessons were being ignored.',
          body: 'You are editing an Amharic translation for publication.\n\n{{RETRIEVED_LESSONS}}\n\n{{STYLE_GUIDELINES}}\n\nFix grammar, awkward wording, and machine-translation stiffness. Do not add or remove facts. Do not summarise. Apply every lesson above that is relevant to this text.\n\nOutput only the corrected Amharic.' },
        { v: 5, author: 'dave@example.com', created_at: NOW - 8 * DAY, note: 'Injected style guidelines block.',
          body: 'You are editing an Amharic translation for publication.\n\n{{STYLE_GUIDELINES}}\n\n{{RETRIEVED_LESSONS}}\n\nFix grammar, awkward wording, and machine-translation stiffness. Do not add or remove facts.\n\nOutput only the corrected Amharic.' },
        { v: 4, author: 'dave@example.com', created_at: NOW - 14 * DAY, note: 'Added the do-not-summarise guard.',
          body: 'Edit the Amharic below for grammar and natural phrasing.\n\n{{RETRIEVED_LESSONS}}\n\nDo not add or remove facts. Do not summarise.' },
        { v: 3, author: 'dave@example.com', created_at: NOW - 19 * DAY, note: 'First version with retrieval injection.',
          body: 'Edit the Amharic below for grammar and natural phrasing.\n\n{{RETRIEVED_LESSONS}}' },
        { v: 2, author: 'dave@example.com', created_at: NOW - 25 * DAY, note: 'Tightened scope to grammar + phrasing.',
          body: 'Edit the Amharic below for grammar and natural phrasing.' },
        { v: 1, author: 'dave@example.com', created_at: NOW - 29 * DAY, note: 'Initial version.',
          body: 'Improve the following Amharic text.' }
      ]
    }
  },

  /* --- finalize compare result -------------------------------------------- */
  compare: {
    fix_count: 5,
    topic_tag: 'economy/trade',
    changes: [
      { kind: 'terminology', text: '“Coffee and Tea Authority” was rendered descriptively; replaced with the body’s official Amharic name (የቡናና ሻይ ባለሥልጣን).' },
      { kind: 'voice', text: 'Two passive constructions in paragraph 1 were made active, matching the writer’s preference for a named subject.' },
      { kind: 'idiom', text: '“Weakest link” was calqued word-for-word; replaced with an idiomatic Amharic equivalent.' },
      { kind: 'punctuation', text: 'Three Latin periods inside quoted speech were replaced with Ethiopic sentence punctuation.' },
      { kind: 'number', text: 'The percentage in paragraph 2 was spelled out; house style keeps numerals for figures.' }
    ],
    next_time: 'Check for an official Amharic name before translating any institution descriptively, and re-check quoted speech for Latin punctuation — both recur across articles in this topic.'
  }
};

/* Convenience derived values -------------------------------------------- */
DB.finalized = DB.articles
  .filter(a => a.status === 'final')
  .sort((a, b) => a.updated_at - b.updated_at);
