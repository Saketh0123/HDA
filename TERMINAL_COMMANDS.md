# EduHub Dashboard - Terminal Commands

## 🚀 Run the Dashboard

### Step 1: Open Terminal/PowerShell
Press: `Windows + R` → Type `cmd` or `powershell` → Press Enter

### Step 2: Navigate to Web Directory
```cmd
cd c:\Users\DELL\Desktop\app hda\web
```

### Step 3: Start the React Server
```cmd
npm start
```

---

## ✅ Expected Output

You should see:
```
> eduhub-admin-dashboard@1.0.0 start
> react-scripts start

Compiled successfully!

You can now view eduhub-admin-dashboard in the browser.

  Local:            http://localhost:3000
  On Your Network:  http://192.168.x.x:3000

Note that the development build is not optimized.
To create a production build, use npm run build.
```

---

## 📍 Open in Browser

Once you see "Compiled successfully!", automatically opens at:
```
http://localhost:3000
```

If not, manually open your browser and go to that URL.

---

## 🛑 Stop the Server

Press: `Ctrl + C` in the terminal

---

## 📱 Mobile App (Separate - If Flutter installed)

Open **another terminal** (don't close the React one):

```cmd
cd c:\Users\DELL\Desktop\app hda\mobile
flutter pub get
flutter run -d android
```

Or for iOS (macOS only):
```cmd
flutter run -d ios
```

Or for web preview:
```cmd
flutter run -d chrome
```

---

## ✨ Dashboard Features to Try

Once running at http://localhost:3000:

- Click **Dashboard** in sidebar
- Click **Students** to see table
- Click **Accounts** for finance dashboard
- Click **Statistics** for charts
- Try the search & filter boxes
- Responsive design - resize browser window

---

**READY? Copy and run the commands above! 🚀**
