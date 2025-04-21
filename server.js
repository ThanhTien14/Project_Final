const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mongodbModule = require('./public/javascripts/mongodb');

const app = express();
const port = 3000;

// Thiết lập thư mục lưu trữ file upload
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Cấu hình multer để xử lý file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); // Lưu file vào thư mục public/uploads
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext); // Tạo tên file duy nhất
    }
});
const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const fileTypes = /jpeg|jpg|png|gif/;
        const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = fileTypes.test(file.mimetype);
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Chỉ chấp nhận file hình ảnh (jpg, png, gif)!'));
        }
    },
    limits: { fileSize: 5 * 1024 * 1024 } // Giới hạn kích thước file: 5MB
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10kb' }));

// Hàm validate dữ liệu sản phẩm
function validateProductData(data) {
    const errors = [];
    // if (!isUpdate) {
    //     if (!data.id || !/^TPCN\d{4}$/.test(data.id)) {
    //         errors.push('ID phải có định dạng TPCNxxxx');
    //     }
    //     if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
    //         errors.push('Tên sản phẩm là bắt buộc');
    //     }
    //     // Kiểm tra các trường dạng chuỗi trước khi chúng được chuẩn hóa thành mảng
    //     if (!data.ingredients || typeof data.ingredients !== 'string' || data.ingredients.trim() === '') {
    //         errors.push('Thành phần là bắt buộc');
    //     }
    //     if (!data.benefits || typeof data.benefits !== 'string' || data.benefits.trim() === '') {
    //         errors.push('Lợi ích là bắt buộc');
    //     }
    //     if (!data.usage_instructions || typeof data.usage_instructions !== 'string' || data.usage_instructions.trim() === '') {
    //         errors.push('Hướng dẫn sử dụng là bắt buộc');
    //     }
    //     if (!data.warnings || typeof data.warnings !== 'string' || data.warnings.trim() === '') {
    //         errors.push('Cảnh báo là bắt buộc');
    //     }
    //     if (!data.storage_instructions || typeof data.storage_instructions !== 'string' || data.storage_instructions.trim() === '') {
    //         errors.push('Hướng dẫn bảo quản là bắt buộc');
    //     }
    //     if (!data.target_audience || typeof data.target_audience !== 'string' || data.target_audience.trim() === '') {
    //         errors.push('Đối tượng sử dụng là bắt buộc');
    //     }
    //     if (!data.certifications || typeof data.certifications !== 'string' || data.certifications.trim() === '') {
    //         errors.push('Chứng nhận là bắt buộc');
    //     }
    //     if (isNaN(data.quantity_in_stock) || data.quantity_in_stock < 0) {
    //         errors.push('Số lượng tồn kho phải là số nguyên không âm');
    //     }
    //     if (isNaN(data.price) || data.price <= 0) {
    //         errors.push('Giá phải là số dương');
    //     }
    // } else {
    //     if (data.id) {
    //         errors.push('Không được thay đổi ID sản phẩm');
    //     }
    // }
    if (data.image_url && !data.image_url.startsWith('/uploads/')) {
        errors.push('image_url phải là đường dẫn file hợp lệ');
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
    ['ingredients', 'benefits', 'target_audience', 'certifications', 'warnings'].forEach(field => {
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
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: 'Lỗi khi upload file', details: err.message });
    }
    const errorMessage = process.env.NODE_ENV === 'development' ? err.message : 'Internal server error';
    res.status(500).json({ error: errorMessage });
});

// Route root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pages', 'index.html'));
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

// API: Lấy ID sản phẩm cao nhất
app.get('/api/products/latest-id', async (req, res) => {
    try {
        const latestProduct = await mongodbModule.dbCollection
            .aggregate([
                { $match: { id: /^TPCN\d{4}$/ } },
                {
                    $addFields: {
                        idNumber: {
                            $toInt: { $substr: ['$id', 4, 4] }
                        }
                    }
                },
                { $sort: { idNumber: -1 } },
                { $limit: 1 }
            ])
            .toArray();

        const latestId = latestProduct.length > 0 ? latestProduct[0].id : null;
        console.log('ID sản phẩm cao nhất:', latestId);
        res.json({ latestId });
    } catch (error) {
        console.error('Lỗi khi lấy ID sản phẩm cao nhất:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// API: Tạo một sản phẩm mới
app.post('/api/products', upload.single('image_file'), async (req, res) => {
    try {
        // Lấy dữ liệu từ FormData và parse đúng kiểu dữ liệu
        const productData = {
            id: req.body.id,
            name: req.body.name,
            description: req.body.description,
            category: req.body.category,
            brand: req.body.brand,
            dosage_form: req.body.dosage_form,
            image_url: req.file ? `/uploads/${req.file.filename}` : '',
            ingredients: req.body.ingredients,
            benefits: req.body.benefits,
            usage_instructions: req.body.usage_instructions,
            warnings: req.body.warnings,
            storage_instructions: req.body.storage_instructions,
            target_audience: req.body.target_audience,
            certifications: req.body.certifications,
            quantity_in_stock: parseInt(req.body.quantity_in_stock) || 0,
            price: parseFloat(req.body.price) || 0,
            currency: req.body.currency,
            created_at: new Date(),
            updated_at: new Date(),
            is_active: true
        };

        // Kiểm tra dữ liệu đầu vào
        const errors = validateProductData(productData);
        if (errors.length > 0) {
            if (req.file) {
                fs.unlinkSync(path.join(uploadDir, req.file.filename));
            }
            return res.status(400).json({ error: 'Invalid data', details: errors });
        }

        // Kiểm tra xem ID đã tồn tại chưa
        const existingProduct = await mongodbModule.dbCollection.findOne({ id: productData.id });
        if (existingProduct) {
            if (req.file) {
                fs.unlinkSync(path.join(uploadDir, req.file.filename));
            }
            return res.status(400).json({ error: 'ID đã tồn tại' });
        }

        // Chuẩn hóa dữ liệu trước khi lưu
        const normalizedData = normalizeProductData({
            ...productData,
            created_at: new Date(),
            updated_at: new Date(),
            is_active: true,
            qna: [],
            ratings: []
        });

        // Lưu dữ liệu vào MongoDB
        await mongodbModule.dbCollection.insertOne(normalizedData);
        res.status(201).json({ message: `Product ${normalizedData.id} created successfully`, id: normalizedData.id });
    } catch (error) {
        if (req.file) {
            fs.unlinkSync(path.join(uploadDir, req.file.filename));
        }
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
        const { id } = req.params;
        const products = await mongodbModule.findDocumentsById(id);
        if (products.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(products[0]);
    } catch (error) {
        throw error;
    }
});

// API: Cập nhật một sản phẩm
app.put('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const errors = validateProductData(req.body, true);
        if (errors.length > 0) {
            return res.status(400).json({ error: 'Invalid data', details: errors });
        }
        const productData = normalizeProductData(req.body);
        const modifiedCount = await mongodbModule.updateDocumentById(id, productData);
        if (modifiedCount === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json({ message: `Product ${id} updated successfully` });
    } catch (error) {
        throw error;
    }
});

// Xử lý đóng kết nối MongoDB
process.on('SIGINT', async () => {
    await mongodbModule.closeMongoDBConnection();
    process.exit(0);
});