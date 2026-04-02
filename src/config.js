module.exports = {
  // RSS source URL
  RSS_URL: 'https://feeds.bbci.co.uk/news/rss.xml',

  // Topics to monitor (array of strings)
  TOPICS: ['美以和伊朗冲突'],

  // AI Configuration (OpenRouter)
  AI_MODEL: 'google/gemma-3-27b-it:free', // Default model, can be adjusted
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',

  // Discord Configuration
  DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL || '',

  // File path for persistence
  PROCESSED_FILE: './data/processed.json'
};
