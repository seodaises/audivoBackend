'use strict';

const publicProfile = (user) => {
  if (!user) return null;

  if (user.deleted_at !== null && user.deleted_at !== undefined) {
    return {
      id: null,
      username: '[deleted]',
      displayName: '[deleted user]',
      avatarUrl: null,
      isDeleted: true, 
    };
  }

  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name ?? null,
    avatarUrl: user.avatar_url ?? null,
    isDeleted: false,
  };
};

module.exports = { publicProfile };