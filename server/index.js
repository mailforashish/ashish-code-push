const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');
const fs = require('fs');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/')
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname)
  }
});
const upload = multer({ storage: storage });

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost/code-push', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Bundle Schema
const BundleSchema = new mongoose.Schema({
  appVersion: String,
  packageHash: String,
  bundleFile: String,
  platform: String,
  deploymentKey: String,
  label: String,
  createdAt: { type: Date, default: Date.now }
});

const Bundle = mongoose.model('Bundle', BundleSchema);

// Endpoints
app.post('/api/upload', upload.single('bundle'), async (req, res) => {
  try {
    const {
      appVersion,
      platform,
      deploymentKey,
      label
    } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No bundle file uploaded' });
    }

    const bundle = new Bundle({
      appVersion,
      platform,
      deploymentKey,
      label,
      bundleFile: req.file.path,
      packageHash: generateHash(req.file.path)
    });

    await bundle.save();
    console.log('Bundle uploaded successfully:', bundle);
    res.json({ success: true, bundle });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/update-check', async (req, res) => {
  try {
    const {
      appVersion,
      platform,
      deploymentKey,
      currentPackageHash
    } = req.query;

    console.log('Checking for update:', { appVersion, platform, deploymentKey });

    const latestBundle = await Bundle.findOne({
      appVersion,
      platform,
      deploymentKey
    }).sort({ createdAt: -1 });

    if (!latestBundle) {
      console.log('No update available');
      return res.json({ updateAvailable: false });
    }

    if (latestBundle.packageHash === currentPackageHash) {
      console.log('Client already has latest version');
      return res.json({ updateAvailable: false });
    }

    console.log('Update available:', latestBundle);
    res.json({
      updateAvailable: true,
      update: {
        packageHash: latestBundle.packageHash,
        downloadUrl: `/api/download/${latestBundle._id}`,
        label: latestBundle.label
      }
    });
  } catch (error) {
    console.error('Update check error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/download/:bundleId', async (req, res) => {
  try {
    const bundle = await Bundle.findById(req.params.bundleId);
    if (!bundle) {
      return res.status(404).json({ error: 'Bundle not found' });
    }

    console.log('Downloading bundle:', bundle);
    res.download(bundle.bundleFile);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: error.message });
  }
});

function generateHash(filePath) {
  return require('crypto')
    .createHash('sha256')
    .update(require('fs').readFileSync(filePath))
    .digest('hex');
}

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 