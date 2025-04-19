const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const mongodbModule = require('./public/javascripts/mongodb');

const app = express();
const port = 3000;

// Thiết lập multer để xử lý upload file
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public/images/uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const productId = req.params.id; // Lấy productId từ URL
        const timestamp = Date.now();
        const extension = path.extname(file.originalname);
        cb(null, `${productId}-${timestamp}${extension}`); // Đặt tên: <product_id>-<timestamp>.<extension>
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // Giới hạn 5MB
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Chỉ hỗ trợ file hình ảnh (jpeg, jpg, png, gif)'));
        }
    }
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10kb' }));
app.use('/uploads', express.static(path.join(__dirname, 'public/images/uploads')));

// Hàm validate dữ liệu sản phẩm
function validateProductData(data, isUpdate = false) {
    const errors = [];
    if (!isUpdate) {
        if (!data.id || !/^TPCN\d{4}$/.test(data.id)) {
            errors.push('ID phải có định dạng TPCNxxxx');
        }
        if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
            errors.push('Tên sản phẩm là bắt buộc');
        }
        if (!Number.isInteger(data.quantity_in_stock) || data.quantity_in_stock < 0) {
            errors.push('Số lượng tồn kho phải là số nguyên không âm');
        }
        if (typeof data.price !== 'number' || data.price <= 0) {
            errors.push('Giá phải là số dương');
        }
    } else {
        if (data.id) {
            errors.push('Không được thay đổi ID sản phẩm');
        }
    }
    if (data.image_url && !/^https?:\/\/.+\..+/.test(data.image_url)) {
        errors.push('image_url phải là URL hợp lệ');
    }
    if (data.currency && !['VND', 'USD'].includes(data.currency)) {
        errors.push('Tiền tệ chỉ được là VND hoặc USD');
    }
    return errors;
}

// Hàm chuẩn hóa dữ liệu
function normalizeProductData(data) {
    const normalized = { ...data };
    normalized.updated_at = new Date();
    ['ingredients', 'benefits', 'target_audience', 'certifications'].forEach(field => {
        if (typeof normalized[field] === 'string' && normalized[field].trim()) {
            normalized[field] = normalized[field].split(',').map(item => item.trim()).filter(item => item);
        } else if (!normalized[field]) {
            normalized[field] = [];
        }
    });
    return normalized;
}

// Middleware xử lý lỗi
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Route root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pages', 'index.html'));
});

// API: Lấy ID sản phẩm cao nhất
app.get('/api/products/latest-id', async (req, res) => {
    try {
        const latestProduct = await mongodbModule.dbCollection.findOne(
            { id: /^TPCN\d{4}$/ },
            { sort: { id: -1 } }
        );
        res.json({ latestId: latestProduct ? latestProduct.id : null });
    } catch (error) {
        throw error;
    }
});

// API: Tạo một sản phẩm mới
app.post('/api/products', async (req, res) => {
    try {
        const errors = validateProductData(req.body);
        if (errors.length > 0) {
            return res.status(400).json({ error: 'Invalid data', details: errors });
        }
        const productData = normalizeProductData({
            ...req.body,
            created_at: new Date(),
            is_active: true,
            qna: [],
            ratings: [],
        });
        await mongodbModule.dbCollection.insertOne(productData);
        res.status(201).json({ message: `Product ${productData.id} created successfully`, id: productData.id });
    } catch (error) {
        throw error;
    }
});

// API: Lấy danh sách sản phẩm
app.get('/api/products', async (req, res) => {
    try {
        const { name, priceFrom, priceTo, category, brand, logic } = req.query;
        const criteria = { name, priceFrom, priceTo, category, brand, logic };
        const products = await mongodbModule.findDocuments(criteria);
        res.json(products);
    } catch (error) {
        throw error;
    }
});

// API: Lấy chi tiết một sản phẩm
app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await mongodbModule.dbCollection.findOne({ id: req.params.id });
        if (!product) {
            return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
        }
        res.json(product);
    } catch (error) {
        throw error;
    }
});

// API: Cập nhật một sản phẩm
app.put('/api/products/:id', upload.single('image'), async (req, res) => {
    try {
        const updateData = req.body;
        const errors = validateProductData(updateData, true);
        if (errors.length > 0) {
            return res.status(400).json({ error: 'Invalid data', details: errors });
        }

        // Xử lý hình ảnh nếu có file upload
        if (req.file) {
            // Lấy thông tin sản phẩm hiện tại để xóa file cũ (nếu có)
            const existingProduct = await mongodbModule.dbCollection.findOne({ id: req.params.id });
            if (existingProduct && existingProduct.image_url) {
                const oldImagePath = path.join(__dirname, 'public', existingProduct.image_url);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath); // Xóa file cũ
                }
            }
            updateData.image_url = `/images/uploads/${req.file.filename}`; // Lưu đường dẫn file mới
        }

        const normalizedData = normalizeProductData(updateData);
        const result = await mongodbModule.dbCollection.updateOne(
            { id: req.params.id },
            { $set: normalizedData }
        );
        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
        }
        res.json({ message: 'Cập nhật sản phẩm thành công' });
    } catch (error) {
        throw error;
    }
});

// Kết nối MongoDB
mongodbModule.connectToMongoDB()
    .then(() => {
        console.log('Kết nối MongoDB thành công!');
        app.listen(port, () => console.log(`Server chạy trên port ${port}!`));
    })
    .catch(err => {
        console.error('Lỗi kết nối MongoDB:', err);
        process.exit(1);
    });

// Xử lý đóng kết nối MongoDB
process.on('SIGINT', async () => {
    await mongodbModule.closeMongoDBConnection();
    process.exit(0);
});