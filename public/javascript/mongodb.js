// kết nối MongoDB
const MongoClient = require('mongodb').MongoClient;
const mongodbUrl = 'mongodb://localhost:27017'; // Địa chỉ MongoDB
const dbName = 'mydatabase'; // Tên cơ sở dữ liệu
const collectionName = 'dsTPCN'; // Tên collection

let dbCollection;
let client;

async function connectToMongoDB() {
    try {
        client = await MongoClient.connect(mongodbUrl);
        dbCollection = client.db(dbName).collection(collectionName);
    } catch (err) {
        throw err;
    }
}

async function closeMongoDBConnection() {
    if (client) {
        await client.close()
            .then(() => {
                console.log("Đã đóng kết nối MongoDB!");
                process.exit(0);
            })
            .catch(err => {
                console.error("Lỗi khi đóng kết nối MongoDB:", err);
                process.exit(1);
            });
    } else {
        process.exit(0);
    }
}

async function findDocumentsByName(productName){
    const products = await dbCollection.find({"name": { $regex: productName}}).toArray();
    return products;
}

async function findDocumentsById(productID){
    const products = await dbCollection.find({"id": {$regex: productID}}).toArray();
    return products;
}

async function findDocuments(){
    const products = await dbCollection.find().toArray();
    return products;
}

async function updateDocumentById(id, updatedData){
    const result = await dbCollection.updateOne({"id": id}, {$set: updatedData});
    return result.modifiedCount;
}

module.exports = {
    connectToMongoDB,
    closeMongoDBConnection,
    findDocumentsByName,
    findDocumentsById,
    findDocuments,
    updateDocumentById
};

