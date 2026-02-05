const Razorpay = require('razorpay');
require('dotenv').config();

const razorpay = new Razorpay({
    key_id: "rzp_live_SAWrANbkbWONmt",
    key_secret: "SbJ3eWEcqonP3rgN3z1jb4NX"
});

module.exports = razorpay;
