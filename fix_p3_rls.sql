-- Make sure RLS is fully disabled on P3 position
ALTER TABLE public."P3 position" DISABLE ROW LEVEL SECURITY;

-- Also drop any existing RLS policies just in case
DROP POLICY IF EXISTS "Allow all" ON public."P3 position";

-- Grant full access to anon and authenticated roles
GRANT ALL ON public."P3 position" TO anon;
GRANT ALL ON public."P3 position" TO authenticated;
GRANT USAGE ON SEQUENCE public."P3 position_id_seq" TO anon;
GRANT USAGE ON SEQUENCE public."P3 position_id_seq" TO authenticated;
