# MailChat

פלטפורמת תקשורת בזמן אמת לפי כתובת מייל, מחוברת ל-Supabase.

## הגדרה

1. העתיקו את `.env.example` ל-`.env.local` ומלאו:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

2. הריצו את סכמת ה-SQL מתוך `supabase/schema.sql` ב-SQL Editor של Supabase.

3. ב-Supabase → Authentication → URL Configuration הוסיפו את כתובת האפליקציה (למשל `http://localhost:5173` ואת דומיין Vercel) ל-Redirect URLs.

4. הפעלה מקומית:

```bash
npm install
npm run dev
```

## Vercel

הוסיפו את אותם משתנים כ-Environment Variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

השתמשו רק ב-Anon / Publishable Key בצד לקוח — לא ב-Secret Key.
