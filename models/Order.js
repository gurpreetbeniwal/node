module.exports = (sequelize, DataTypes) => {
    const Order = sequelize.define('Order', {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            autoIncrement: true,
            primaryKey: true
        },
        user_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false
        },
        order_number: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true
        },
        shipping_address_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false
        },
        subtotal_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false
        },
        gst_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false
        },
        shipping_charge: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00
        },
        total_amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false
        },
        order_status: {
            type: DataTypes.ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled'),
            allowNull: false,
            defaultValue: 'pending'
        },
        payment_method: {
            type: DataTypes.ENUM('cod', 'online', 'gateway'),
            allowNull: false
        },
        payment_status: {
            type: DataTypes.ENUM('pending', 'completed', 'failed'),
            allowNull: false,
            defaultValue: 'pending'
        },
        payment_gateway_txn_id: {
            type: DataTypes.STRING,
            allowNull: true
        },
        razorpay_order_id: {
            type: DataTypes.STRING,
            allowNull: true
        },
        razorpay_signature: {
            type: DataTypes.STRING,
            allowNull: true
        },

        // Contact Information
        contact_email: {
            type: DataTypes.STRING(255),
            allowNull: false,
            validate: {
                isEmail: true
            }
        },
        contact_phone: {
            type: DataTypes.STRING(20),
            allowNull: false
        },
        order_notes: {
            type: DataTypes.TEXT,
            allowNull: true
        },

        // Regular Coupon Fields
        coupon_code: {
            type: DataTypes.STRING(50),
            allowNull: true
        },
        coupon_discount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00
        },

        // Flash Sale Fields
        flash_sale_code: {
            type: DataTypes.STRING(50),
            allowNull: true,
            comment: 'Flash sale promo code used'
        },
        flash_discount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00,
            comment: 'Discount amount from flash sale'
        },
        flash_usage_id: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
            comment: 'Reference to FlashSaleUsage record'
        }

    }, {
        tableName: 'orders',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            {
                fields: ['user_id']
            },
            {
                fields: ['order_number'],
                unique: true
            },
            {
                fields: ['order_status']
            },
            {
                fields: ['payment_status']
            },
            {
                fields: ['flash_usage_id']
            },
            {
                fields: ['coupon_code']
            },
            {
                fields: ['created_at']
            }
        ]
    });

    return Order;
};
