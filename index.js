const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const app = express();
app.use(cors());
app.use(express.json());

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 获取简历
app.get('/api/profile', async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: '需要提供 user_id' });

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user_id)
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// 保存简历
app.post('/api/profile', async (req, res) => {
  const { user_id, ...profileData } = req.body;
  if (!user_id) return res.status(400).json({ error: '需要提供 user_id' });

  const { data, error } = await supabase
    .from('profiles')
    .upsert({ user_id, ...profileData, updated_at: new Date() })
    .select();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// AI 简历优化
app.post('/api/ai/optimize', async (req, res) => {
  const { resumeContent, jobDescription, type } = req.body;
  if (!resumeContent || !jobDescription) {
    return res.status(400).json({ error: '需要提供简历内容和职位描述' });
  }

  const typeText = {
    all: '整份简历',
    experience: '工作经历',
    projects: '项目经历',
    skills: '技能描述'
  }[type] || '简历内容';

  const prompt = `
你是一位资深HR和简历优化专家，请优化以下${typeText}。

【原始简历】
${resumeContent}

【目标JD】
${jobDescription}

要求：
1. 融入JD关键词
2. 使用STAR法则
3. 量化成果
4. 突出岗位匹配度
5. 简洁专业

只输出优化后的内容。
`;

  try {
    const completion = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: prompt
    });

    const optimized =
      completion.output_text ||
      completion.output?.[0]?.content?.[0]?.text ||
      '';

    res.json({ optimized, model: completion.model });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'AI优化失败' });
  }
});

// 简历解析
app.post('/api/parse-resume', async (req, res) => {
  try {
    const { fileContent, fileType, fileName } = req.body;
    if (!fileContent) return res.status(400).json({ error: '没有文件内容' });

    const buffer = Buffer.from(fileContent, 'base64');
    let text = '';

    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      text = (await pdfParse(buffer)).text;
    } else if (fileType.includes('word') || fileName.endsWith('.docx')) {
      text = (await mammoth.extractRawText({ buffer })).value;
    } else if (fileType === 'text/plain' || fileName.endsWith('.txt')) {
      text = buffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: '不支持的文件格式' });
    }

    const prompt = `
从以下简历中提取信息，返回严格 JSON：

${text.substring(0, 3000)}

格式：
{
  "full_name": "",
  "email": "",
  "phone": "",
  "education": [],
  "experience": [],
  "projects": [],
  "skills": { "professional": "" }
}
`;

    const completion = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: prompt
    });

    const aiText =
      completion.output_text ||
      completion.output?.[0]?.content?.[0]?.text ||
      '';

    let parsed;
    try {
      parsed = JSON.parse(aiText.replace(/```json|```/g, '').trim());
    } catch {
      return res.json({ success: false, rawText: text });
    }

    res.json({ success: true, parsed });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '解析失败' });
  }
});

// Vercel
module.exports = app;

// 本地
if (process.env.NODE_ENV !== 'production') {
  app.listen(3001, () => console.log('Server running on 3001'));
}
