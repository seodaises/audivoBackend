'use strict';
const db = require('../models');


const cascadeUserSoftDelete = async (userId, transaction) => {
  const id = Number(userId);

  // ── DESTROY ────────────────────────────────────────────────────────────────
  await db.Like.destroy({ where: { user_id: id }, transaction });
  await db.Follow.destroy({ where: { follower_user_id: id }, transaction });
  await db.SavedSong.destroy({ where: { user_id: id }, transaction });
  await db.SavedAlbum.destroy({ where: { user_id: id }, transaction });


  await db.Playlist.destroy({
    where: { user_id: id, is_public: false },
    transaction,
  });

  await db.PlayHistory.update(
    { user_id: null },
    { where: { user_id: id }, transaction }
  );
};

module.exports = { cascadeUserSoftDelete };