const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mongodbModule = require('./public/javascripts/mongodb');

const app = express();
const port = 3000;

// Thiết lập thư mục lưu trữ file upload
const uploadDir = path.join(__dirname, 'public', 'images', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Cấu hình multer để xử lý file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const productId = req.params.id || req.body.id || 'TPCN';
        const timestamp = Date.now();
        const extension = path.extname(file.originalname);
        cb(null, `${productId}-${timestamp}${extension}`);
    }
});
const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        const fileTypes = /jpeg|jpg|png|gif/;
        const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = fileTypes.test(file.mimetype);
        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Chỉ chấp nhận file hình ảnh (jpg, png, gif)!'));
        }
    },
    limits: { fileSize: 50 * 1024 * 1024 } // Giới hạn 50MB
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images/uploads', express.static(uploadDir));
app.use(express.json({ limit: '10kb' }));
app.set('views', path.join(__dirname, 'public', 'pages'));
app.set('view engine', 'ejs');

// Hàm validate dữ liệu sản phẩm
function validateProductData(data, isUpdate = false) {
    const errors = [];
    if (!isUpdate) {
        // Các trường bắt buộc khi tạo sản phẩm
        if (!data.id || !/^TPCN\d{4}$/.test(data.id)) {
            errors.push('ID phải có định dạng TPCNxxxx');
        }
        if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
            errors.push('Tên sản phẩm là bắt buộc');
        }
        if (typeof data.price !== 'number' || data.price <= 0) {
            errors.push('Giá phải là số dương');
        }
        // Các trường không bắt buộc nhưng cần validate nếu có giá trị
        if (data.quantity_in_stock !== undefined && (!Number.isInteger(data.quantity_in_stock) || data.quantity_in_stock < 0)) {
            errors.push('Số lượng tồn kho phải là số nguyên không âm');
        }
    } else {
        if (data.name && (typeof data.name !== 'string' || data.name.trim() === '')) {
            errors.push('Tên sản phẩm không hợp lệ');
        }
        if (data.quantity_in_stock !== undefined && (!Number.isInteger(data.quantity_in_stock) || data.quantity_in_stock < 0)) {
            errors.push('Số lượng tồn kho phải là số nguyên không âm');
        }
        if (data.price !== undefined && (typeof data.price !== 'number' || data.price <= 0)) {
            errors.push('Giá phải là số dương');
        }
    }
    if (data.image_url) {
        if (data.image_url.startsWith('/images/uploads/')) {
            if (!/^\/images\/uploads\/.+/.test(data.image_url)) {
                errors.push('image_url phải là đường dẫn hợp lệ bắt đầu bằng /images/uploads/');
            }
        } else {
            // Nới lỏng regex để chấp nhận URL không có đuôi file rõ ràng
            const urlPattern = /^(https?:\/\/[^\s]+)/i;
            if (!urlPattern.test(data.image_url)) {
                errors.push('URL hình ảnh không hợp lệ (phải bắt đầu bằng http:// hoặc https://)');
            }
        }
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
    // Đặt giá trị mặc định cho các trường không bắt buộc
    if (normalized.quantity_in_stock === undefined) {
        normalized.quantity_in_stock = 0;
    }
    if (!normalized.currency) {
        normalized.currency = 'VND'; // Giá trị mặc định nếu không nhập
    }
    return normalized;
}

// Middleware xử lý lỗi
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File quá lớn, tối đa 50MB' });
        }
        return res.status(400).json({ error: 'Lỗi khi upload file', details: err.message });
    }
    const errorMessage = process.env.NODE_ENV === 'development' ? err.message : 'Internal server error';
    res.status(500).json({ error: errorMessage });
});

// Route root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'pages', 'index.html'));
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
        res.json({ latestId });
    } catch (error) {
        console.error('Lỗi khi lấy ID sản phẩm cao nhất:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// API: Tạo một sản phẩm mới
app.post('/api/products', upload.single('image_file'), async (req, res) => {
    try {
        const productData = {
            id: req.body.id,
            name: req.body.name,
            description: req.body.description,
            category: req.body.category,
            brand: req.body.brand,
            dosage_form: req.body.dosage_form,
            image_url: req.file ? `/images/uploads/${req.file.filename}` : req.body.image_url || '',
            ingredients: req.body.ingredients,
            benefits: req.body.benefits,
            usage_instructions: req.body.usage_instructions,
            warnings: req.body.warnings,
            storage_instructions: req.body.storage_instructions,
            target_audience: req.body.target_audience,
            certifications: req.body.certifications,
            quantity_in_stock: req.body.quantity_in_stock ? parseInt(req.body.quantity_in_stock) : undefined,
            price: req.body.price ? parseFloat(req.body.price) : undefined,
            currency: req.body.currency,
            created_at: new Date(),
            updated_at: new Date(),
            is_active: true,
            qna: [],
            ratings: []
        };

        const errors = validateProductData(productData);
        if (errors.length > 0) {
            if (req.file) {
                fs.unlinkSync(path.join(uploadDir, req.file.filename));
            }
            return res.status(400).json({ error: 'Invalid data', details: errors });
        }

        const existingProduct = await mongodbModule.dbCollection.findOne({ id: productData.id });
        if (existingProduct) {
            if (req.file) {
                fs.unlinkSync(path.join(uploadDir, req.file.filename));
            }
            return res.status(400).json({ error: 'ID đã tồn tại' });
        }

        const normalizedData = normalizeProductData(productData);
        await mongodbModule.dbCollection.insertOne(normalizedData);
        res.status(201).json({
            message: `Product ${normalizedData.id} created successfully`,
            id: normalizedData.id,
            image_url: normalizedData.image_url
        });
    } catch (error) {
        if (req.file) {
            fs.unlinkSync(path.join(uploadDir, req.file.filename));
        }
        console.error('POST /api/products - Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API: Lấy danh sách sản phẩm
app.get('/api/products', async (req, res) => {
    try {
        const { name, priceFrom, priceTo, category, brand, page = 1, limit = 10, sort = 'price', order = 'asc', logic } = req.query;

        if (priceFrom && (isNaN(priceFrom) || Number(priceFrom) < 0)) {
            return res.status(400).json({ error: 'Invalid priceFrom' });
        }
        if (priceTo && (isNaN(priceTo) || Number(priceTo) < 0)) {
            return res.status(400).json({ error: 'Invalid priceTo' });
        }
        const validCategories = ['BDN', 'HTSK', 'KHOANGCHAT', 'LĐ'];
        if (category && !validCategories.includes(category)) {
            return res.status(400).json({ error: 'Invalid category' });
        }

        let query = {};
        if (logic === 'OR' && (name || category || brand)) {
            const orQueries = [];
            if (name) orQueries.push({ name: { $regex: name, $options: 'i' } });
            if (category) orQueries.push({ category });
            if (brand) orQueries.push({ brand });
            query = { $or: orQueries };
        } else {
            if (name) query.name = { $regex: name, $options: 'i' };
            if (category) query.category = category;
            if (brand) query.brand = brand;
        }
        if (priceFrom || priceTo) {
            query.price = {};
            if (priceFrom) query.price.$gte = Number(priceFrom);
            if (priceTo) query.price.$lte = Number(priceTo);
        }

        const sortOptions = {};
        if (sort === 'price') sortOptions.price = order === 'asc' ? 1 : -1;

        const skip = (page - 1) * limit;
        const [products, totalProducts] = await Promise.all([
            mongodbModule.dbCollection.find(query).sort(sortOptions).skip(skip).limit(Number(limit)).toArray(),
            mongodbModule.dbCollection.countDocuments(query)
        ]);

        res.json({
            products: products.map(product => normalizeProductData(product)),
            pagination: { currentPage: Number(page), totalPages: Math.ceil(totalProducts / limit), totalProducts }
        });
    } catch (error) {
        console.error('GET /api/products - Error:', error);
        res.status(500).json({ error: 'Internal server error' });
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
        console.error('GET /api/products/:id - Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API: Cập nhật nhiều sản phẩm
app.put('/api/products/bulk', upload.single('image'), async (req, res) => {
    try {
        console.log('PUT /api/products/bulk called with body:', req.body);
        const { productIds, updateData } = req.body;

        let parsedProductIds, parsedUpdateData;
        try {
            parsedProductIds = typeof productIds === 'string' ? JSON.parse(productIds) : productIds;
            parsedUpdateData = typeof updateData === 'string' ? JSON.parse(updateData) : updateData;
        } catch (error) {
            console.error('Error parsing JSON:', error);
            return res.status(400).json({ error: 'Dữ liệu JSON không hợp lệ' });
        }

        console.log('Parsed productIds:', parsedProductIds);
        console.log('Parsed updateData:', parsedUpdateData);

        if (!parsedProductIds || !Array.isArray(parsedProductIds) || parsedProductIds.length === 0) {
            return res.status(400).json({ error: 'Vui lòng cung cấp danh sách ID sản phẩm' });
        }

        if (!parsedUpdateData || Object.keys(parsedUpdateData).length === 0) {
            return res.status(400).json({ error: 'Vui lòng cung cấp ít nhất một thông tin để cập nhật' });
        }

        // Validate định dạng ID
        const invalidIds = parsedProductIds.filter(id => !/^TPCN\d{4}$/.test(id));
        if (invalidIds.length > 0) {
            return res.status(400).json({ error: `ID sản phẩm không hợp lệ: ${invalidIds.join(', ')}` });
        }

        const errors = validateProductData(parsedUpdateData, true);
        if (errors.length > 0) {
            return res.status(400).json({ error: 'Invalid data', details: errors });
        }

        if (req.file) {
            parsedUpdateData.image_url = `/images/uploads/${req.file.filename}`;
        }

        const normalizedData = normalizeProductData(parsedUpdateData);

        const existingProducts = await mongodbModule.dbCollection.find({ id: { $in: parsedProductIds } }).toArray();
        console.log('Existing products in DB:', existingProducts);

        const existingIds = existingProducts.map(p => p.id);
        const notFoundIds = parsedProductIds.filter(id => !existingIds.includes(id));

        if (existingIds.length === 0) {
            return res.status(404).json({ 
                error: 'Không tìm thấy sản phẩm nào để cập nhật', 
                details: `Danh sách ID không tồn tại: ${parsedProductIds.join(', ')}` 
            });
        }

        const result = await mongodbModule.dbCollection.updateMany(
            { id: { $in: existingIds } },
            { $set: normalizedData }
        );

        let message = `Cập nhật ${result.matchedCount} sản phẩm thành công`;
        if (notFoundIds.length > 0) {
            message += `. Không tìm thấy sản phẩm: ${notFoundIds.join(', ')}`;
        }

        res.json({ message });
    } catch (error) {
        console.error('PUT /api/products/bulk - Error:', error);
        res.status(500).json({ error: 'Lỗi server nội bộ', details: error.message });
    }
});

// API: Cập nhật một sản phẩm
app.put('/api/products/:id', upload.single('image'), async (req, res) => {
    try {
        console.log('PUT /api/products/:id called with ID:', req.params.id);
        console.log('Request body:', req.body);
        console.log('Uploaded file:', req.file);

        // Parse updateData từ formData
        let parsedUpdateData = {};
        if (req.body.updateData) {
            try {
                parsedUpdateData = JSON.parse(req.body.updateData);
            } catch (error) {
                return res.status(400).json({ error: 'Dữ liệu JSON không hợp lệ' });
            }
        }

        // Xử lý số lượng và giá
        if (parsedUpdateData.quantity_in_stock) {
            parsedUpdateData.quantity_in_stock = parseInt(parsedUpdateData.quantity_in_stock);
        }
        if (parsedUpdateData.price) {
            parsedUpdateData.price = parseFloat(parsedUpdateData.price);
        }

        // Kiểm tra sản phẩm tồn tại
        const existingProduct = await mongodbModule.dbCollection.findOne({ id: req.params.id });
        if (!existingProduct) {
            return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
        }

        // Xử lý hình ảnh: Ưu tiên file upload, nếu không có thì lấy từ image_url
        let imageUrl = req.body.image_url || parsedUpdateData.image_url;
        if (req.file) {
            // Nếu có file upload
            parsedUpdateData.image_url = `/images/uploads/${req.file.filename}`;
            // Xóa ảnh cũ nếu có
            if (existingProduct.image_url && existingProduct.image_url.startsWith('/images/uploads/')) {
                const oldImageRelativePath = existingProduct.image_url.replace(/^\/images\/uploads\//, '');
                const oldImagePath = path.join(uploadDir, oldImageRelativePath);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }
        } else if (imageUrl) {
            // Nếu không có file upload nhưng có image_url
            const urlPattern = /^(https?:\/\/[^\s]+)/i;
            if (!urlPattern.test(imageUrl)) {
                return res.status(400).json({ error: 'URL hình ảnh không hợp lệ (phải bắt đầu bằng http:// hoặc https://)' });
            }
            parsedUpdateData.image_url = imageUrl;
        }

        // Validate dữ liệu
        const errors = validateProductData(parsedUpdateData, true);
        if (errors.length > 0) {
            if (req.file) {
                fs.unlinkSync(path.join(uploadDir, req.file.filename));
            }
            return res.status(400).json({ error: 'Dữ liệu không hợp lệ', details: errors });
        }

        // So sánh dữ liệu mới với dữ liệu cũ để kiểm tra thay đổi
        const normalizedData = normalizeProductData(parsedUpdateData);
        const isUnchanged = Object.keys(normalizedData).every(key => {
            if (Array.isArray(normalizedData[key]) && Array.isArray(existingProduct[key])) {
                return normalizedData[key].length === existingProduct[key].length &&
                    normalizedData[key].every((item, idx) => item === existingProduct[key][idx]);
            }
            return normalizedData[key] === existingProduct[key];
        });

        if (isUnchanged && !req.file && !imageUrl) {
            return res.status(400).json({ error: 'Không có thông tin nào được thay đổi' });
        }

        // Cập nhật sản phẩm
        const result = await mongodbModule.dbCollection.updateOne(
            { id: req.params.id },
            { $set: normalizedData }
        );

        if (result.matchedCount === 0) {
            if (req.file) {
                fs.unlinkSync(path.join(uploadDir, req.file.filename));
            }
            return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
        }

        res.json({ message: 'Cập nhật sản phẩm thành công' });
    } catch (error) {
        console.error('PUT /api/products/:id - Error:', error);
        if (req.file) {
            fs.unlinkSync(path.join(uploadDir, req.file.filename));
        }
        if (error.message.includes('file')) {
            return res.status(400).json({ error: 'Lỗi khi xử lý file ảnh', details: error.message });
        }
        res.status(500).json({ error: 'Lỗi server nội bộ', details: error.message });
    }
});

// API: Xóa một sản phẩm
app.delete('/api/products/:id', async (req, res) => {
    try {
        console.log('DELETE /api/products/:id called with ID:', req.params.id);
        const { id } = req.params;
        if (!/^TPCN\d{4}$/.test(id)) {
            return res.status(400).json({ error: 'Định dạng ID sản phẩm không hợp lệ' });
        }
        const product = await mongodbModule.dbCollection.findOne({ id });
        if (!product) {
            return res.status(404).json({ error: `Không tìm thấy sản phẩm ${id}` });
        }
        // Xóa ảnh nếu có
        if (product.image_url && product.image_url.startsWith('/images/uploads/')) {
            const imageRelativePath = product.image_url.replace(/^\/images\/uploads\//, '');
            const imagePath = path.join(uploadDir, imageRelativePath);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }
        const result = await mongodbModule.dbCollection.deleteOne({ id });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: `Không tìm thấy sản phẩm ${id}` });
        }
        res.json({ message: `Xóa sản phẩm ${id} thành công` });
    } catch (error) {
        console.error('DELETE /api/products/:id - Error:', error);
        res.status(500).json({ error: 'Lỗi server nội bộ' });
    }
});

// API: Xóa tất cả sản phẩm
app.delete('/api/products', async (req, res) => {
    try {
        console.log('DELETE /api/products called');
        // Xóa tất cả ảnh trong thư mục uploads
        const files = fs.readdirSync(uploadDir);
        files.forEach(file => {
            const filePath = path.join(uploadDir, file);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        });
        const result = await mongodbModule.dbCollection.deleteMany({});
        res.json({ message: `Xóa ${result.deletedCount} sản phẩm thành công` });
    } catch (error) {
        console.error('DELETE /api/products - Error:', error);
        res.status(500).json({ error: 'Lỗi server nội bộ' });
    }
});

// API: Tìm kiếm sản phẩm
app.get('/api/products/search', async (req, res) => {
    try {
        const { name } = req.query;
        if (!name || name.trim().length < 2) {
            return res.status(400).json({ error: 'Tìm kiếm phải có ít nhất 2 ký tự' });
        }
        const products = await mongodbModule.dbCollection.find({
            name: { $regex: name.trim(), $options: 'i' }
        }).limit(50).toArray();
        res.json(products.length ? products : []);
    } catch (error) {
        console.error('GET /api/products/search - Error:', error);
        res.status(500).json({ error: 'Lỗi server nội bộ' });
    }
});

// API: Kiểm tra trùng lặp tên sản phẩm
app.post('/api/products/check-duplicate', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Tên sản phẩm là bắt buộc.' });
        }

        const existingProduct = await mongodbModule.dbCollection.findOne({ name });
        if (existingProduct) {
            return res.status(200).json({ exists: true });
        }
        return res.status(200).json({ exists: false });
    } catch (error) {
        console.error('Lỗi khi kiểm tra trùng lặp:', error);
        return res.status(500).json({ error: 'Lỗi server khi kiểm tra trùng lặp.' });
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