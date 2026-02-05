module.exports = (sequelize, DataTypes) => {
  const FlashSaleUsage = sequelize.define('FlashSaleUsage', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    flash_sale_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    tier_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    discount_applied: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Actual discount percentage received'
    },
    used_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      comment: 'When the code was used'
    }
  }, {
    tableName: 'flash_sale_usage',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  });

  return FlashSaleUsage;
};
