const admin = require("firebase-admin");
const serviceAccount = require("./.firebase/kgs-test-68924-firebase-adminsdk-v8xyz.json"); // Assuming local default or use ADC
// Since we are in the workspace, we can try to initialize without credentials and it might work if FIRESTORE_EMULATOR_HOST is set or if GOOGLE_APPLICATION_CREDENTIALS is set, but since it's a real project, we need the actual credentials, which we might not have in the workspace.
