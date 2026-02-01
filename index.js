const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

// 数据库连接（你的 Supabase）
const supabase = createClient(
  'https://prmjdpysdhpbiwrlnstc.supabase.co',  // 换成你的真实URL
  'sb_secret_EpIlAS84HYEeN4XOjaTD1Q_MKTE9LqN'  // 换成你的真实service_role key
);

// OpenAI 配置（关键！）
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY  // 从环境变量读取
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

// AI 优化接口（核心功能）
app.post('/api/ai/optimize', async (req, res) => {
  const { resumeContent, jobDescription, type } = req.body;
  
  if (!resumeContent || !jobDescription) {
    return res.status(400).json({ error: '需要提供简历内容和职位描述' });
  }

  const typeText = {
    'all': '整份简历',
    'experience': '工作经历部分',
    'projects': '项目经历部分',
    'skills': '技能描述部分'
  }[type] || '简历内容';

  const prompt = `你是一位资深HR和简历优化专家。请优化以下${typeText}：

【原始简历内容】：
${resumeContent}

【目标职位JD】：
${jobDescription}

【优化要求】：
1. 提取JD中的关键词自然融入
2. 使用STAR法则（情境-任务-行动-结果）
3. 量化成果（用数字、百分比）
4. 突出匹配岗位的技能和经验
5. 专业简洁，避免空话套话

请直接输出优化后的内容，不要解释：`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",  // 建议先用3.5便宜，效果好再换gpt-4
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 2000
    });
    
    res.json({ 
      optimized: completion.choices[0].message.content,
      model: completion.model
    });
  } catch (error) {
    console.error('OpenAI Error:', error);
    res.status(500).json({ 
      error: 'AI优化失败：' + (error.message || '未知错误') 
    });
  }
});

// 记录申请（可选）
app.post('/api/applications', async (req, res) => {
  res.json({ message: "功能开发中" });
});
// 文件解析接口（支持PDF/Word/TXT）
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

app.post('/api/parse-resume', async (req, res) => {
  try {
    const { fileContent, fileType, fileName } = req.body;
    
    if (!fileContent) {
      return res.status(400).json({ error: '没有文件内容' });
    }

    let text = '';
    const buffer = Buffer.from(fileContent, 'base64');

    // 根据类型解析
    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      const pdfData = await pdfParse(buffer);
      text = pdfData.text;
    } 
    else if (fileType.includes('word') || fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    }
    else if (fileType === 'text/plain' || fileName.endsWith('.txt')) {
      text = buffer.toString('utf-8');
    }
    else {
      return res.status(400).json({ error: '不支持的文件格式，请上传PDF、Word或TXT' });
    }

    // 使用OpenAI提取结构化信息
    const prompt = `从以下简历文本中提取关键信息，返回JSON格式：
    
简历文本：
${text.substring(0, 3000)}  // 限制长度避免token超限

请提取并返回以下JSON格式：
{
  "full_name": "姓名",
  "email": "邮箱",
  "phone": "电话",
  "education": [
    {
      "school": "学校名",
      "degree": "学历（本科/硕士/博士）",
      "major": "专业",
      "end_date": "毕业时间（YYYY-MM）"
    }
  ],
  "experience": [
    {
      "company": "公司名",
      "position": "职位",
      "description": "工作内容（概括）"
    }
  ],
  "projects": [
    {
      "name": "项目名",
      "description": "项目描述"
    }
  ],
  "skills": {
    "professional": "技能（用逗号分隔）"
  }
}

注意：
1. 如果某项找不到，返回空字符串或空数组
2. 只返回JSON，不要其他文字
3. 日期统一格式YYYY-MM
4. 如果没有明确信息，合理推断`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",  // 或 gpt-4
      messages: [
        { role: "system", content: "你是一个简历信息提取助手，擅长从非结构化文本中提取简历字段。" },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    // 解析AI返回的JSON
    let parsedData;
    try {
      const aiText = completion.choices[0].message.content;
      // 清理可能的markdown代码块
      const jsonStr = aiText.replace(/```json|```/g, '').trim();
      parsedData = JSON.parse(jsonStr);
    } catch (e) {
      // 如果解析失败，返回原始文本让用户手动处理
      return res.json({ 
        success: true, 
        text: text,
        parsed: null,
        error: 'AI解析JSON失败，已返回原始文本'
      });
    }

    res.json({
      success: true,
      text: text.substring(0, 500) + '...',  // 预览
      parsed: parsedData
    });

  } catch (error) {
    console.error('解析错误:', error);
    res.status(500).json({ error: '解析失败: ' + error.message });
  }
});

// Vercel 导出
module.exports = app;

// 本地开发
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}


