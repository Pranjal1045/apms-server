import mongoose from "mongoose";

export const connectDB = async () => {
    mongoose.connect(process.env.MONGO_URI, {
        dbName: "fyp_management_system"
    }).then(()=>{
        console.log("Connected to database.");
    }).catch((err) => {
        console.log("Database connection failed.", err);
    });
};