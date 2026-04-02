/*
  # Create Products and Extractions System

  1. New Tables
    - `products`
      - `id` (uuid, primary key)
      - `reference` (text, unique) - Product reference like "ART4506"
      - `name` (text) - Product name
      - `price` (numeric) - Product price
      - `stock` (integer) - Stock quantity
      - `image_url` (text) - Product image URL
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `extractions`
      - `id` (uuid, primary key)
      - `user_id` (uuid)
      - `image_url` (text) - Uploaded image URL
      - `extracted_references` (jsonb) - Array of detected references
      - `status` (text) - processing, completed, error
      - `pdf_url` (text, nullable) - Generated PDF URL
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `extraction_products`
      - `id` (uuid, primary key)
      - `extraction_id` (uuid, references extractions)
      - `product_id` (uuid, references products)
      - `quantity` (integer, default 1)
      - `created_at` (timestamptz)
*/

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text UNIQUE NOT NULL,
  name text NOT NULL,
  price numeric DEFAULT 0,
  stock integer DEFAULT 0,
  image_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Extractions table
CREATE TABLE IF NOT EXISTS extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  image_url text NOT NULL,
  extracted_references jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'processing',
  pdf_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Extraction products junction table
CREATE TABLE IF NOT EXISTS extraction_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extraction_id uuid REFERENCES extractions(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  quantity integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_reference ON products(reference);
CREATE INDEX IF NOT EXISTS idx_extractions_user_id ON extractions(user_id);
CREATE INDEX IF NOT EXISTS idx_extraction_products_extraction_id ON extraction_products(extraction_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_extractions_updated_at
  BEFORE UPDATE ON extractions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
