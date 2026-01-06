# Regenerating Prisma Client

The Prisma client needs to be regenerated to include the new Forwarder model.

## Steps:

1. **Stop your Next.js dev server** (if running) - Press Ctrl+C in the terminal where it's running

2. **Regenerate Prisma Client:**
   ```bash
   npx prisma generate
   ```

3. **Restart your dev server:**
   ```bash
   npm run dev
   ```

## Alternative (if the above doesn't work):

If you get a file lock error, try:
1. Close all terminals and VS Code/Cursor
2. Open a new terminal
3. Run: `npx prisma generate`
4. Start the dev server again

The database table has already been created, you just need to regenerate the Prisma client to use it.


