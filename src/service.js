import { routeOperation } from "./router.js";

export async function doctor(options = {}) {
  return routeOperation("doctor", options);
}

export async function doctorFull(options = {}) {
  return routeOperation("doctor_full", options);
}

export async function login(options = {}) {
  return routeOperation("login", options);
}

export async function listSavedNotes(options = {}) {
  return routeOperation("list_saved_notes", options);
}

export async function listSavedBoards(options = {}) {
  return routeOperation("list_saved_boards", options);
}

export async function listBoardItems(options = {}) {
  return routeOperation("list_board_items", options);
}

export async function getSavedNoteDetail(options = {}) {
  return routeOperation("get_saved_note_detail", options);
}

export async function getNoteDetail(options = {}) {
  return routeOperation("get_note_detail", options);
}

export async function listHomeFeed(options = {}) {
  return routeOperation("list_home_feed", options);
}

export async function searchNotes(options = {}) {
  return routeOperation("search_notes", options);
}

export async function getNoteComments(options = {}) {
  return routeOperation("get_note_comments", options);
}

export async function listUserNotes(options = {}) {
  return routeOperation("list_user_notes", options);
}

export async function likeNote(options = {}) {
  return routeOperation("like_note", options);
}

export async function favoriteNote(options = {}) {
  return routeOperation("favorite_note", options);
}

export async function postComment(options = {}) {
  return routeOperation("post_comment", options);
}

export async function replyComment(options = {}) {
  return routeOperation("reply_comment", options);
}

export async function publishNote(options = {}) {
  return routeOperation("publish_note", options);
}

export async function publishVideo(options = {}) {
  return routeOperation("publish_video", options);
}

export async function getCreatorDashboard(options = {}) {
  return routeOperation("get_creator_dashboard", options);
}

export async function getCreatorContentMetrics(options = {}) {
  return routeOperation("get_creator_content_metrics", options);
}

export async function getCreatorFanMetrics(options = {}) {
  return routeOperation("get_creator_fan_metrics", options);
}
