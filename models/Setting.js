module.exports = (sequelize, DataTypes) => {
    const Setting = sequelize.define('Setting', {
        id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
        setting_key: { type: DataTypes.STRING(100), allowNull: false, unique: true },
        setting_value: { type: DataTypes.TEXT, allowNull: true },
        description: { type: DataTypes.STRING }
    }, {
        tableName: 'settings',
        timestamps: false
    });
    return Setting;
};
