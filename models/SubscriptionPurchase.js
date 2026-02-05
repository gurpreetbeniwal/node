module.exports = (sequelize, DataTypes) => {
    const SubscriptionPurchase = sequelize.define('SubscriptionPurchase', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        base_price: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            comment: 'Original price of the plan'
        },
        discount_applied: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00,
            comment: 'Amount discounted'
        },
        final_price: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            comment: 'Final price paid by user'
        },
        referral_code: {
            type: DataTypes.STRING(50),
            allowNull: true,
            comment: 'Referral code used for this purchase'
        },
        purchased_at: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            allowNull: false
        }
    }, {
        tableName: 'subscription_purchases',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    return SubscriptionPurchase;
};
