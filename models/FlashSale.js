module.exports = (sequelize, DataTypes) => {
  const FlashSale = sequelize.define('FlashSale', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(150),
      allowNull: false,
      comment: 'Flash sale display name'
    },
    code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: 'Promo code like "MembersOnly"'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Sale description for display'
    },
    start_time: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'Sale start time in IST'
    },
    end_time: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'Sale end time in IST'
    },
    status: {
      type: DataTypes.ENUM('scheduled', 'active', 'ended'),
      defaultValue: 'scheduled',
      allowNull: false
    },
    is_members_only: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Requires active subscription to participate'
    }
  }, {
    tableName: 'flash_sales',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['code'] },
      { fields: ['status', 'start_time', 'end_time'] }
    ]
  });

  // Define associations after model definition
  FlashSale.associate = models => {
    models.FlashSale.hasMany(models.FlashSaleTier, {
      foreignKey: 'flash_sale_id',
      as: 'tiers',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
    models.FlashSale.hasMany(models.FlashSaleUsage, {
      foreignKey: 'flash_sale_id',
      as: 'usages',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  };

  return FlashSale;
};
