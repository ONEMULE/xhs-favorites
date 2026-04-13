import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBoardUrl,
  buildNoteUrl,
  classifySnapshot,
  normalizeBoardFeedEntry,
  normalizeBoards,
  normalizeNoteDetail,
  normalizeSavedNotes,
  parseBoardId,
  parseChineseCount,
  parseNoteIdFromUrl,
  parseXsecTokenFromUrl
} from "../src/extractors.js";

test("parseChineseCount handles plain and ten-thousand units", () => {
  assert.equal(parseChineseCount("15"), 15);
  assert.equal(parseChineseCount("1.2万"), 12000);
  assert.equal(parseChineseCount(42), 42);
  assert.equal(parseChineseCount(""), null);
});

test("normalizeSavedNotes extracts urls and counters", () => {
  const items = normalizeSavedNotes([
    {
      id: "abc123",
      xsecToken: "token-1",
      noteCard: {
        displayTitle: "AI 工具合集",
        user: { nickName: "作者A" },
        cover: { urlDefault: "https://img.example/1.jpg" },
        interactInfo: { likedCount: "1.2万", commentCount: "36" }
      }
    }
  ]);

  assert.deepEqual(items, [
    {
      note_id: "abc123",
      xsec_token: "token-1",
      title: "AI 工具合集",
      author: "作者A",
      cover_url: "https://img.example/1.jpg",
      note_url:
        "https://www.xiaohongshu.com/discovery/item/abc123?source=webshare&xhsshare=pc_web&xsec_token=token-1&xsec_source=pc_share",
      like_count: 12000,
      comment_count: 36,
      board_name: null
    }
  ]);
});

test("normalizeBoards returns board metadata", () => {
  const boards = normalizeBoards([
    { id: "board-1", name: "AI", total: 8, privacy: 0, desc: "收藏夹" }
  ]);

  assert.deepEqual(boards, [
    {
      board_id: "board-1",
      board_name: "AI",
      board_url: "https://www.xiaohongshu.com/board/board-1?source=web_user_page",
      item_count: 8,
      privacy: 0,
      desc: "收藏夹"
    }
  ]);
});

test("normalizeBoardFeedEntry extracts nested board note items", () => {
  const entry = normalizeBoardFeedEntry(
    {
      cursor: "next-1",
      hasMore: true,
      board: { name: "AI 收藏" },
      notes: [
        {
          noteId: "note-1",
          xsecToken: "token-a",
          displayTitle: "工具一",
          user: { nickName: "作者B" },
          cover: { urlDefault: "https://img.example/a.jpg" },
          interactInfo: { likedCount: 99, commentCount: 5 }
        }
      ]
    },
    "board-1"
  );

  assert.deepEqual(entry, {
    board_id: "board-1",
    next_cursor: "next-1",
    has_more: true,
    items: [
      {
        note_id: "note-1",
        xsec_token: "token-a",
        title: "工具一",
        author: "作者B",
        cover_url: "https://img.example/a.jpg",
        note_url:
          "https://www.xiaohongshu.com/discovery/item/note-1?source=webshare&xhsshare=pc_web&xsec_token=token-a&xsec_source=pc_share",
        like_count: 99,
        comment_count: 5,
        board_name: "AI 收藏"
      }
    ]
  });
});

test("normalizeNoteDetail extracts tags and video urls", () => {
  const detail = normalizeNoteDetail(
    {
      id: "note-1",
      title: "标题",
      desc: "内容",
      user: { nickname: "作者C" },
      tagList: [{ name: "AI" }, { name: "工具" }],
      imageList: [{ urlDefault: "https://img.example/1.jpg" }],
      interactInfo: { likedCount: 10, commentCount: 2, collectedCount: 3 },
      video: {
        media: {
          stream: {
            h264: [
              {
                masterUrl: "https://video.example/a.mp4",
                width: 1280,
                height: 720,
                size: 1200
              }
            ]
          }
        }
      }
    },
    { noteUrl: "https://www.xiaohongshu.com/explore/note-1" }
  );

  assert.deepEqual(detail, {
    note_id: "note-1",
    title: "标题",
    author: "作者C",
    content: "内容",
    tags: ["AI", "工具"],
    images: ["https://img.example/1.jpg"],
    videos: ["https://video.example/a.mp4"],
    note_url: "https://www.xiaohongshu.com/explore/note-1",
    like_count: 10,
    comment_count: 2,
    collect_count: 3,
    published_time: null,
    note_type: null,
    video_streams: [
      {
        codec: "h264",
        url: "https://video.example/a.mp4",
        width: 1280,
        height: 720,
        size: 1200,
        stream_type: null
      }
    ]
  });
});

test("utility parsers and classifiers cover core cases", () => {
  assert.equal(parseBoardId("https://www.xiaohongshu.com/board/board-1?source=web_user_page"), "board-1");
  assert.equal(parseNoteIdFromUrl("https://www.xiaohongshu.com/explore/note-1"), "note-1");
  assert.equal(parseXsecTokenFromUrl("https://www.xiaohongshu.com/explore/note-1?xsec_token=abc"), "abc");
  assert.equal(buildBoardUrl("board-1"), "https://www.xiaohongshu.com/board/board-1?source=web_user_page");
  assert.equal(buildNoteUrl("note-1", null), "https://www.xiaohongshu.com/explore/note-1");
  assert.equal(
    classifySnapshot({ title: "安全限制", body_text: "", url: "", has_login_container: false, has_profile_link: false, sidebar_text: "" }),
    "risk_controlled"
  );
  assert.equal(
    classifySnapshot({ title: "", body_text: "扫码登录", url: "", has_login_container: true, has_profile_link: false, sidebar_text: "" }),
    "auth_required"
  );
  assert.equal(
    classifySnapshot({ title: "", body_text: "", url: "/user/profile/123", has_login_container: false, has_profile_link: true, sidebar_text: "我" }),
    "authenticated"
  );
});
