const Parser = require('rss-parser');
const OpenAI = require('openai');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const parser = new Parser();

// Configure OpenAI client for OpenRouter
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: config.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://github.com/mirai2333/news-bot', // Optional
    'X-Title': 'BBC News AI Bot', // Optional
  }
});

/**
 * Load processed GUIDs from file
 */
function loadProcessedIds() {
  try {
    if (fs.existsSync(config.PROCESSED_FILE)) {
      const data = fs.readFileSync(config.PROCESSED_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading processed file:', err);
  }
  return [];
}

/**
 * Save processed GUIDs to file
 */
function saveProcessedIds(ids) {
  try {
    const dir = path.dirname(config.PROCESSED_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Keep the list manageable (e.g., last 1000 items)
    const recentIds = ids.slice(-1000);
    fs.writeFileSync(config.PROCESSED_FILE, JSON.stringify(recentIds, null, 2));
  } catch (err) {
    console.error('Error saving processed file:', err);
  }
}

/**
 * Use AI to judge if a news item matches any topic
 * @returns {Promise<string[]>} Matched topics
 */
async function judgeNews(title, content, topics) {
  if (!config.OPENROUTER_API_KEY) {
    console.warn('OPENROUTER_API_KEY is not set. Skipping AI analysis.');
    return [];
  }

  const prompt = `
Task: Analyze the news item below and determine if it is related to any of the specified topics.
Topics: ${topics.join(', ')}

News Title: ${title}
News Description: ${content}

Instruction: 
1. If the news is related to one or more topics, return the list of matched topics separated by commas.
2. If it matches none, return "NONE".
Only return the matched topics or "NONE". No extra explanation.
`.trim();

  try {
    const completion = await openai.chat.completions.create({
      model: config.AI_MODEL,
      messages: [{ role: 'user', content: prompt }],
    });

    const result = completion.choices[0].message.content.trim();
    if (result.toUpperCase() === 'NONE') return [];

    // Split by commas and filter to match only our predefined topics
    return result.split(',').map(t => t.trim()).filter(t => topics.includes(t));
  } catch (err) {
    console.error('AI analysis error:', err);
    return [];
  }
}

/**
 * Send notification to Discord
 */
async function sendToDiscord(item, matchedTopics) {
  if (!config.DISCORD_WEBHOOK_URL) {
    console.warn('DISCORD_WEBHOOK_URL is not set. Notification skipped.');
    console.log('Would have sent:', item.title);
    return;
  }

  const payload = {
    embeds: [{
      title: item.title,
      description: item.contentSnippet || item.content,
      url: item.link,
      color: 0xff0000, // BBC Red
      fields: [
        { name: 'Matched Topics', value: matchedTopics.join(', '), inline: true },
        { name: 'Source', value: 'BBC News', inline: true }
      ],
      timestamp: new Date(item.isoDate || new Date()).toISOString()
    }]
  };

  try {
    const response = await fetch(config.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error('Discord API response error:', response.statusText);
    }
  } catch (err) {
    console.error('Error sending to Discord:', err);
  }
}

/**
 * Main function
 */
async function run() {
  console.log('Starting News Bot...');
  console.log('Fetching RSS from:', config.RSS_URL);

  const processedIds = loadProcessedIds();
  const newProcessedIds = [...processedIds];

  try {
    const feed = await parser.parseURL(config.RSS_URL);
    console.log(`Fetched ${feed.items.length} items from feed.`);

    // BBC uses guid but some items might not have it. Fallback to link.
    for (const item of feed.items) {
      const id = item.guid || item.link;

      if (processedIds.includes(id)) {
        continue; // Already processed
      }

      console.log(`Analyzing: ${item.title}`);

      const matchedTopics = await judgeNews(item.title, item.description, config.TOPICS);

      if (matchedTopics.length > 0) {
        console.log(`Match found! Topics: ${matchedTopics.join(', ')}`);
        await sendToDiscord(item, matchedTopics);
      }

      newProcessedIds.push(id);
    }

    saveProcessedIds(newProcessedIds);
    console.log('Bot finished processing.');
  } catch (err) {
    console.error('Main loop error:', err);
  }
}

run();
