const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const upload = multer({ dest: 'uploads/' });

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost/code-push', {
  useNewUrlParser: true,
  useUnifiedTopology: true
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

    const bundle = new Bundle({
      appVersion,
      platform,
      deploymentKey,
      label,
      bundleFile: req.file.path,
      packageHash: generateHash(req.file.path)
    });

    await bundle.save();
    res.json({ success: true, bundle });
  } catch (error) {
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

    const latestBundle = await Bundle.findOne({
      appVersion,
      platform,
      deploymentKey
    }).sort({ createdAt: -1 });

    if (!latestBundle) {
      return res.json({ updateAvailable: false });
    }

    if (latestBundle.packageHash === currentPackageHash) {
      return res.json({ updateAvailable: false });
    }

    res.json({
      updateAvailable: true,
      update: {
        packageHash: latestBundle.packageHash,
        downloadUrl: `/api/download/${latestBundle._id}`,
        label: latestBundle.label
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/download/:bundleId', async (req, res) => {
  try {
    const bundle = await Bundle.findById(req.params.bundleId);
    if (!bundle) {
      return res.status(404).json({ error: 'Bundle not found' });
    }

    res.download(bundle.bundleFile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function generateHash(filePath) {
  return require('crypto')
    .createHash('sha256')
    .update(require('fs').readFileSync(filePath))
    .digest('hex');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 