module.exports = (sequelize, DataTypes) => {
  const Influencer = sequelize.define('Influencer', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    referral_code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: 'Unique referral code for the influencer'
    },
    discount_percent: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
        max: 100
      },
      comment: 'Discount percentage (0-100) applied when using this code'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'influencers',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  return Influencer;
};
