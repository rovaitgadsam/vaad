# ועד הבית

אפליקציית ניהול ועד בית, מתארחת ב-GitHub Pages ומשתמשת ב-Firebase Firestore לסנכרון בין מכשירים.

## פרויקט Firebase

- Project ID: `vaad-af7d3`
- Firebase JavaScript SDK: `13.2.0` via the official modular CDN browser imports
- Authentication: Google sign-in
- Firestore document: `appData/main`
- Data model: schema version 2, documented in `docs/data-model.md`

## הגדרה חד-פעמית ב-Firebase Console

1. בחרו בפרויקט `vaad-af7d3`.
2. ב-Project settings -> General -> Your apps, העתיקו את הגדרות ה-Web app. אם אין Web app, צרו אפליקציית Web.
3. העתיקו את `apiKey`, `messagingSenderId` ו-`appId` אל `src/services/firebase-config.js`. אין להוסיף service-account key לקוד.
4. ב-Authentication -> Sign-in method, הפעילו Google.
5. ב-Authentication -> Settings -> Authorized domains, הוסיפו את `rovaitgadsam.github.io`.
6. צרו Cloud Firestore database במצב Production.
7. התחברו לאפליקציה עם חשבון Google המיועד לבעלים. ממשק החיבור יציג את Firebase UID.
8. החליפו ב-`firestore.rules` את `REPLACE_WITH_OWNER_FIREBASE_UID` ב-UID שהוצג.
9. התקינו Firebase CLI והתחברו:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use vaad-af7d3
   firebase deploy --only firestore:rules,firestore:indexes
   ```
10. לאחר פריסת הכללים, רעננו את האפליקציה. בכניסה הראשונה, הנתונים המקומיים במכשיר שבו מתחברים לראשונה יועתקו למסמך הענן אם המסמך עדיין לא קיים.

## מודל סנכרון והגנת נתונים

- המסמך `appData/main` מכיל את מצב האפליקציה המלא.
- לכל כתיבה מוצמד מספר גרסה (`revision`).
- כתיבה מתבצעת ב-Firestore transaction ורק אם הגרסה בענן תואמת לגרסה האחרונה שנקראה.
- אם מכשיר אחר עדכן את הנתונים במקביל, הכתיבה נעצרת ומוצגת התנגשות במקום לדרוס נתונים.
- הנתונים נשמרים מקומית גם כאשר הענן אינו זמין.
- המסמך בענן נוצר פעם אחת בלבד. חיבור מכשיר נוסף אינו מייבא את הנתונים המקומיים שלו מעל נתוני הענן.

## אבטחה

כללי Firestore חסומים כברירת מחדל. לפני החלפת ה-UID ופריסת הכללים, קריאה וכתיבה למסמך הענן יידחו. אין לפתוח הרשאות לכלל המשתמשים המאומתים.

## גיבוי

השתמשו בפעולת הורדת הגיבוי באפליקציה לפני חיבור מכשיר נוסף או שחזור. הארכיון ההיסטורי המובנה בקוד אינו חלק ממסמך הנתונים בענן.
