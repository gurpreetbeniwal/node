module.exports = (sequelize, DataTypes) => {
    const User = sequelize.define('User', {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        first_name: { type: DataTypes.STRING(100), allowNull: false },
        last_name: { type: DataTypes.STRING(100), allowNull: false },
        // The 'unique' constraint is moved to the indexes array below
        email: { type: DataTypes.STRING, allowNull: false, validate: { isEmail: true } },
        phone_number: { type: DataTypes.STRING(20), allowNull: true },
        password_hash: { type: DataTypes.STRING, allowNull: true },
        google_id: { type: DataTypes.STRING, allowNull: true },
        avatar_url: { type: DataTypes.TEXT },
        role: { type: DataTypes.ENUM('customer', 'admin', 'order_manager'), allowNull: false, defaultValue: 'customer' },
        otp: { type: DataTypes.STRING(10), allowNull: true },
        otp_expires_at: { type: DataTypes.DATE, allowNull: true }
    }, {
        tableName: 'users',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        // --- FIX: All unique constraints are now explicitly defined here ---
        indexes: [
            {
                unique: true,
                fields: ['email']
            },
            {
                unique: true,
                fields: ['google_id']
            },
            {
                unique: true,
                // Important: MySQL doesn't allow nullable fields in unique keys by default
                // This will work correctly if phone_number is always unique when not null
                fields: ['phone_number'] 
            }
        ]
    });
    return User;
};