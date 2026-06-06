-- Fix DELETE/INSERT permission for P2 position (anon role needs full access)
ALTER TABLE public."P2 position" DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public."P2 position" TO anon;
GRANT ALL ON public."P2 position" TO authenticated;
GRANT USAGE ON SEQUENCE public."P2 position_id_seq" TO anon;
GRANT USAGE ON SEQUENCE public."P2 position_id_seq" TO authenticated;

-- Also ensure P3 position is correct
ALTER TABLE public."P3 position" DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public."P3 position" TO anon;
GRANT ALL ON public."P3 position" TO authenticated;
GRANT USAGE ON SEQUENCE public."P3 position_id_seq" TO anon;
GRANT USAGE ON SEQUENCE public."P3 position_id_seq" TO authenticated;
