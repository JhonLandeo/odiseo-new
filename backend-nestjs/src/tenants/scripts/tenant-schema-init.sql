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
