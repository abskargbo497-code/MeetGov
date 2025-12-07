# How to Start the Development Server

## Steps:

1. Open a terminal in the `MeetGov/frontend` directory

2. Make sure dependencies are installed:
   ```powershell
   npm install
   ```

3. Start the development server:
   ```powershell
   npm run dev
   ```

4. The server should start on `http://localhost:5173`

5. Open your browser and navigate to `http://localhost:5173`

## Troubleshooting:

- If you see a blank page, open the browser's Developer Console (F12) and check for errors
- Make sure the backend server is running on `http://localhost:3000` if you need API functionality
- Check that all files are saved and there are no syntax errors

## Common Issues:

- **Blank page**: Check browser console for JavaScript errors
- **Cannot connect**: Make sure port 5173 is not already in use
- **Import errors**: Make sure all files exist and paths are correct

