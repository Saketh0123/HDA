# Student Management System - Design System

## 🎨 Color Palette

| Purpose | Color | Hex | Usage |
|---------|-------|-----|-------|
| Primary | Soft Blue | #2563EB | Buttons, Links, Headers |
| Background | Light Grey | #F5F7FA | Page Background |
| Success | Green | #10B981 | Income, Positive Status |
| Alert | Red | #EF4444 | Expenditure, Warnings |
| Text Primary | Dark Grey | #1F2937 | Main Text |
| Text Secondary | Medium Grey | #6B7280 | Secondary Text |
| Border | Light Grey | #E5E7EB | Dividers, Borders |
| White | Pure White | #FFFFFF | Cards, Surfaces |

## 📐 Typography

**Font Stack:** `'SF Pro Display', 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif`

| Type | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| H1 | 32px | 700 | 40px | Page Titles |
| H2 | 24px | 700 | 32px | Section Headers |
| H3 | 20px | 600 | 28px | Card Headers |
| Body | 14px | 400 | 21px | Main Text |
| Body Small | 12px | 400 | 18px | Secondary Text |
| Button | 14px | 600 | 20px | Button Text |

## 📏 Spacing & Layout

- **Grid:** 8pt spacing system
- **Card Radius:** 12–16px
- **Button Radius:** 8px
- **Shadows:** Soft, consistent
  - Subtle: `0 1px 3px rgba(0, 0, 0, 0.1)`
  - Medium: `0 4px 6px rgba(0, 0, 0, 0.1)`
  - Large: `0 10px 15px rgba(0, 0, 0, 0.1)`

## 🔘 Button States

| State | Background | Border | Text |
|-------|-----------|--------|------|
| Default | #2563EB | #2563EB | White |
| Hover | #1D4ED8 | #1D4ED8 | White |
| Disabled | #E5E7EB | #E5E7EB | #9CA3AF |
| Secondary | White | #E5E7EB | #1F2937 |

## 📱 Responsive Breakpoints

- **Mobile:** 320px – 480px
- **Tablet:** 481px – 768px
- **Desktop:** 769px+

## ⚡ Animation Speeds

- **Instant:** Opacity changes
- **Fast:** 200ms (Hover effects)
- **Normal:** 300ms (Transitions)
- **Slow:** 500ms (Page transitions)

## 🔐 Security Design Principles

- ✅ No sensitive data in list views without authorization
- ✅ Confirmation dialogs for destructive actions
- ✅ Role-based visibility
- ✅ Audit trails for financial operations
- ✅ Session timeout after 30 minutes of inactivity
