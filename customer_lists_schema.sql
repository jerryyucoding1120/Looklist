-- Customer Lists Feature
-- This migration creates tables for customers to save and organize their favorite listings

-- Create customer_lists table
CREATE TABLE IF NOT EXISTS customer_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create list_items table (many-to-many relationship between lists and listings)
CREATE TABLE IF NOT EXISTS list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID NOT NULL REFERENCES customer_lists(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(list_id, listing_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_customer_lists_customer_id ON customer_lists(customer_id);
CREATE INDEX IF NOT EXISTS idx_list_items_list_id ON list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_list_items_listing_id ON list_items(listing_id);

-- Enable Row Level Security
ALTER TABLE customer_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_items ENABLE ROW LEVEL SECURITY;

-- Policies for customer_lists
-- Customers can view their own lists
CREATE POLICY "Customers can view own lists" ON customer_lists
  FOR SELECT
  USING (auth.uid() = customer_id);

-- Customers can create their own lists
CREATE POLICY "Customers can create own lists" ON customer_lists
  FOR INSERT
  WITH CHECK (auth.uid() = customer_id);

-- Customers can update their own lists
CREATE POLICY "Customers can update own lists" ON customer_lists
  FOR UPDATE
  USING (auth.uid() = customer_id);

-- Customers can delete their own lists
CREATE POLICY "Customers can delete own lists" ON customer_lists
  FOR DELETE
  USING (auth.uid() = customer_id);

-- Policies for list_items
-- Customers can view items in their lists
CREATE POLICY "Customers can view own list items" ON list_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM customer_lists
      WHERE customer_lists.id = list_items.list_id
      AND customer_lists.customer_id = auth.uid()
    )
  );

-- Customers can add items to their lists
CREATE POLICY "Customers can add items to own lists" ON list_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM customer_lists
      WHERE customer_lists.id = list_items.list_id
      AND customer_lists.customer_id = auth.uid()
    )
  );

-- Customers can remove items from their lists
CREATE POLICY "Customers can remove items from own lists" ON list_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM customer_lists
      WHERE customer_lists.id = list_items.list_id
      AND customer_lists.customer_id = auth.uid()
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_customer_lists_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER customer_lists_updated_at
  BEFORE UPDATE ON customer_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_lists_updated_at();
