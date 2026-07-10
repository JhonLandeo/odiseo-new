import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Cargar archivo .env
dotenv.config({ path: path.join(__dirname, '../.env') });

async function seedCatalogs() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASS || '123456',
    database: process.env.DB_NAME || 'odiseo',
  });

  try {
    await client.connect();
    console.log('🔌 Connected to PostgreSQL database...');

    // Load JSON files
    const coursesPath = path.join(__dirname, 'data', 'courses.json');
    const topicsPath = path.join(__dirname, 'data', 'topics.json');
    const subtopicsPath = path.join(__dirname, 'data', 'subtopics.json');

    if (!fs.existsSync(coursesPath) || !fs.existsSync(topicsPath) || !fs.existsSync(subtopicsPath)) {
      console.error('❌ Data files not found. Please create scripts/data/courses.json, scripts/data/topics.json, and scripts/data/subtopics.json');
      process.exit(1);
    }

    const coursesData = JSON.parse(fs.readFileSync(coursesPath, 'utf8'));
    const topicsData = JSON.parse(fs.readFileSync(topicsPath, 'utf8'));
    const subtopicsData = JSON.parse(fs.readFileSync(subtopicsPath, 'utf8'));

    // The JSON might be wrapped in an object if it was a DB export, e.g. {"select * from course": [...]}
    // Let's extract the arrays.
    const courses = Array.isArray(coursesData) ? coursesData : Object.values(coursesData)[0] as any[];
    const topics = Array.isArray(topicsData) ? topicsData : Object.values(topicsData)[0] as any[];
    const subtopics = Array.isArray(subtopicsData) ? subtopicsData : Object.values(subtopicsData)[0] as any[];

    console.log(`📦 Found ${courses.length} courses, ${topics.length} topics, and ${subtopics.length} subtopics. Seeding into public schema...`);

    // We will use a transaction for safety
    await client.query('BEGIN');

    // Create tables if they somehow don't exist (though they should)
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.courses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.topics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
      
      CREATE TABLE IF NOT EXISTS public.subtopics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        topic_id UUID REFERENCES public.topics(id) ON DELETE CASCADE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS public.questions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        topic_id UUID NOT NULL,
        subtopic_id UUID NOT NULL,
        difficulty_level VARCHAR(50) DEFAULT 'MEDIUM',
        html_content TEXT NOT NULL,
        options JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      );
    `);

    // Insert Courses
    for (const c of courses) {
      const uuid = String(c.id).padStart(12, '0');
      const courseId = `00000000-0000-0000-0000-${uuid}`;
      
      await client.query(
        `INSERT INTO public.courses (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
        [courseId, c.name]
      );
    }

    // Insert Topics
    for (const t of topics) {
      const uuid = String(t.id).padStart(12, '0');
      const topicId = `00000000-0000-0000-0000-${uuid}`;
      
      const courseUuid = String(t.course_id).padStart(12, '0');
      const courseId = `00000000-0000-0000-0000-${courseUuid}`;

      // Asegurar que el curso referenciado exista en public.courses para evitar violación de FK
      await client.query(
        `INSERT INTO public.courses (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
        [courseId, `Curso Faltante ${t.course_id}`]
      );

      await client.query(
        `INSERT INTO public.topics (id, name, course_id) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [topicId, t.name, courseId]
      );
    }

    // Insert Subtopics and 2 dummy questions per subtopic
    console.log('Seeding subtopics and generating dummy questions (this might take a minute)...');
    
    // Batch inserts for questions to speed it up
    let questionValues: any[][] = [];
    const maxBatchSize = 1000;

    const flushQuestions = async () => {
      if (questionValues.length === 0) return;
      
      const valuesStr = questionValues.map((_, i) => 
        `($${i*6+1}, $${i*6+2}, $${i*6+3}, $${i*6+4}, $${i*6+5}, $${i*6+6})`
      ).join(', ');
      
      const params = questionValues.flatMap(v => v);
      
      await client.query(`
        INSERT INTO public.questions (id, topic_id, subtopic_id, difficulty_level, html_content, options)
        VALUES ${valuesStr}
      `, params);
      
      questionValues = [];
    };

    for (const s of subtopics) {
      const uuid = String(s.id).padStart(12, '0');
      const subtopicId = `00000000-0000-0000-0000-${uuid}`;
      
      const topicUuid = String(s.topic_id).padStart(12, '0');
      const topicId = `00000000-0000-0000-0000-${topicUuid}`;

      // Asegurar que el topic referenciado exista para evitar violación de FK
      await client.query(
        `INSERT INTO public.topics (id, name, course_id) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [topicId, `Tópico Faltante ${s.topic_id}`, '00000000-0000-0000-0000-000000000001']
      );

      await client.query(
        `INSERT INTO public.subtopics (id, name, topic_id) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [subtopicId, s.name, topicId]
      );

      // Generate 2 dummy questions for this subtopic
      for (let i = 1; i <= 2; i++) {
        const questionId = require('crypto').randomUUID();
        const htmlContent = `<p>Si sabemos que $x = ${Math.floor(Math.random() * 10)}$ y $y = ${Math.floor(Math.random() * 10)}$, resuelva la siguiente ecuación (Tema: ${s.name}):</p> <math><mrow><mi>x</mi><mo>+</mo><mi>y</mi><mo>=</mo><mo>?</mo></mrow></math>`;
        const options = JSON.stringify([
          { label: 'A', text: '10', is_correct: i === 1 },
          { label: 'B', text: '12', is_correct: i === 2 },
          { label: 'C', text: '14', is_correct: false },
          { label: 'D', text: 'N.A', is_correct: false },
        ]);

        questionValues.push([questionId, topicId, subtopicId, 'MEDIUM', htmlContent, options]);
        if (questionValues.length >= maxBatchSize) {
          await flushQuestions();
        }
      }
    }
    await flushQuestions(); // flush remaining

    await client.query('COMMIT');
    console.log('✅ Catalogs and Questions seeded successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', error);
  } finally {
    await client.end();
  }
}

seedCatalogs();
