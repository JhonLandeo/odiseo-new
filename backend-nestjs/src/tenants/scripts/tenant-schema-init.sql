-- DDL for provisioning a new tenant schema

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  company_id UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  guard_name VARCHAR(50) NOT NULL DEFAULT 'web',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  guard_name VARCHAR(50) NOT NULL DEFAULT 'web',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_has_roles (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  model_id UUID NOT NULL,
  model_type VARCHAR(100) NOT NULL DEFAULT 'User',
  PRIMARY KEY (role_id, model_id, model_type)
);

CREATE TABLE IF NOT EXISTS role_has_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS tenant_topic_visibility (
  topic_id UUID PRIMARY KEY REFERENCES public.topics(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  year INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days_per_week INTEGER NOT NULL DEFAULT 5,
  total_weeks INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  university_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS cycle_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS cycle_material_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  scope VARCHAR(50) NOT NULL,
  accumulation_weeks INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cycle_material_template_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES cycle_material_templates(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  questions_quantity INTEGER NOT NULL,
  easy_count INTEGER NOT NULL DEFAULT 0,
  medium_count INTEGER NOT NULL DEFAULT 0,
  hard_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pdf_design_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  banner_image_url TEXT,
  watermark_image_url TEXT,
  cover_image_url TEXT,
  show_cover BOOLEAN NOT NULL DEFAULT false,
  primary_title_color VARCHAR(20) NOT NULL DEFAULT '2, 113, 184',
  secondary_title_color VARCHAR(20) NOT NULL DEFAULT '2, 113, 184',
  background_highlight_color VARCHAR(20) NOT NULL DEFAULT '214, 238, 253',
  margin_top VARCHAR(20) NOT NULL DEFAULT '3cm',
  margin_bottom VARCHAR(20) NOT NULL DEFAULT '1.5cm',
  margin_inside VARCHAR(20) NOT NULL DEFAULT '1cm',
  margin_outside VARCHAR(20) NOT NULL DEFAULT '1cm',
  is_book_mode BOOLEAN NOT NULL DEFAULT false,
  font_family VARCHAR(50) NOT NULL DEFAULT 'Arial',
  border_radius VARCHAR(20) NOT NULL DEFAULT '4px',
  content_font_size VARCHAR(20) NOT NULL DEFAULT '11pt',
  content_text_color VARCHAR(20) NOT NULL DEFAULT '#000000',
  blocks_config JSONB,
  header_config JSONB,
  footer_config JSONB,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS syllabus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES cycles(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  template_id UUID REFERENCES cycle_material_templates(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS syllabus_distribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  syllabus_id UUID NOT NULL REFERENCES syllabus(id) ON DELETE RESTRICT,
  template_id UUID REFERENCES cycle_material_templates(id) ON DELETE SET NULL,
  week_number INTEGER NOT NULL,
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  subtopic_id UUID NOT NULL REFERENCES public.subtopics(id) ON DELETE CASCADE,
  question_count INTEGER NOT NULL CHECK (question_count > 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT UQ_syllabus_template_week_topic_subtopic UNIQUE (syllabus_id, template_id, week_number, topic_id, subtopic_id)
);

-- Basic Seed for new tenant
INSERT INTO roles (name, guard_name) VALUES ('admin', 'web')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, guard_name) VALUES
  ('view_catalogs', 'web'),
  ('edit_catalogs', 'web'),
  ('view_materials', 'web'),
  ('generate_material', 'web'),
  ('review_material', 'web'),
  ('view_syllabus', 'web'),
  ('edit_syllabus', 'web'),
  ('manage_academic_time', 'web')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_has_permissions (role_id, permission_id)
  SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;
