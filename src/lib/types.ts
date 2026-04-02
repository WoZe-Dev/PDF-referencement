export interface Product {
  id?: string;
  reference: string;
  name: string;
  price: number;
  stock: number;
  image_url?: string;
  quantity?: number;
}

export interface Extraction {
  id?: string;
  user_id?: string;
  image_url: string;
  extracted_references: string[];
  status: 'processing' | 'completed' | 'error';
  pdf_url?: string;
  created_at?: string;
  updated_at?: string;
}
