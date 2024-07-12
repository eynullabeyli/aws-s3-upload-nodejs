const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { S3Client } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const readline = require('readline');
const path = require('path');
const mime = require('mime-types');

// Load environment variables from a .env file (create this file with your environment variables)
require('dotenv').config();

// AWS credentials from environment variables
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const bucketName = process.env.AWS_BUCKET_NAME;
const region = process.env.AWS_REGION;

// Initialize S3 client
const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

const app = express();
const port = process.env.PORT || 3001;

// Configure multer for file upload with size limit and file type validation
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB size limit
  },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|pdf/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('File type not allowed'));
  },
});

// Create a readline interface for dynamic updating
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

app.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).send('No file uploaded.');
  }

  // Sanitize the file name
  const sanitizedFileName = path.basename(file.originalname).replace(/[^a-z0-9\.\-_]/gi, '_').toLowerCase();
  const fileStream = fs.createReadStream(file.path);

  const params = {
    Bucket: bucketName,
    Key: sanitizedFileName,
    Body: fileStream,
    ContentType: mime.lookup(sanitizedFileName) || 'application/octet-stream',
  };

  try {
    const upload = new Upload({
      client: s3Client,
      params: params,
      leavePartsOnError: false,
    });

    upload.on('httpUploadProgress', (progress) => {
      const percentage = Math.round((progress.loaded / progress.total) * 100);
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0, null);
      process.stdout.write(`Upload Progress: ${percentage}%`);
    });

    await upload.done();
    rl.close();

    // Remove file from local server after upload
    fs.unlink(file.path, (err) => {
      if (err) console.error('Failed to delete local file:', err);
    });

    const publicUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${sanitizedFileName}`;
    res.status(200).send(`File uploaded successfully. Public URL: ${publicUrl}`);
  } catch (err) {
    rl.close();
    res.status(500).send(`Error uploading file: ${err.message}`);
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
