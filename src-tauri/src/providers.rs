//! Free translation, no API key.
//! 1) Google's public translate endpoint (fast, best quality), retried once.
//! 2) MyMemory as a backup if Google fails or is blocked.
//! Requests are built with `.query(...)`, so no URL is ever assembled by hand.

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

const GOOGLE_URL: &str = "https://translate.googleapis.com/translate_a/single";
const MYMEMORY_URL: &str = "https://api.mymemory.translated.net/get";
const CHUNK: usize = 400; // characters per request (MyMemory allows at most 500)

#[derive(Deserialize)]
pub struct TranslateRequest {
    pub text: String,
    pub source: String,
    pub target: String,
}

#[derive(Serialize, Clone)]
pub struct TranslateResult {
    pub text: String,
    pub detected: Option<String>,
    pub engine: String,
}

struct Piece {
    sep: &'static str, // text placed before this piece ("\n" = new line, " " = same line)
    text: String,
}

fn split_sentences(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut it = line.chars().peekable();
    while let Some(c) = it.next() {
        cur.push(c);
        let ends = matches!(c, '.' | '!' | '?' | '\u{0964}' | '\u{0965}' | '\u{3002}');
        if ends && it.peek().map_or(true, |n| n.is_whitespace()) {
            while let Some(n) = it.peek() {
                if n.is_whitespace() {
                    cur.push(*n);
                    it.next();
                } else {
                    break;
                }
            }
            out.push(std::mem::take(&mut cur));
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

// Splits text into small pieces, keeping line breaks exactly as the user wrote them.
fn split_text(text: &str, max: usize) -> Vec<Piece> {
    let mut pieces: Vec<Piece> = Vec::new();
    for (i, raw) in text.split('\n').enumerate() {
        let line = raw.trim_end_matches('\r');
        let line_sep: &'static str = if i == 0 { "" } else { "\n" };
        if line.chars().count() <= max {
            pieces.push(Piece { sep: line_sep, text: line.to_string() });
            continue;
        }
        let mut first = true;
        let mut cur = String::new();
        let mut cur_len = 0usize;
        let mut flush = |cur: &mut String, cur_len: &mut usize, first: &mut bool| {
            if !cur.trim().is_empty() {
                let sep = if *first { line_sep } else { " " };
                pieces.push(Piece { sep, text: cur.trim().to_string() });
                *first = false;
            }
            cur.clear();
            *cur_len = 0;
        };
        for sentence in split_sentences(line) {
            let n = sentence.chars().count();
            if cur_len + n > max && cur_len > 0 {
                flush(&mut cur, &mut cur_len, &mut first);
            }
            if n > max {
                let chars: Vec<char> = sentence.chars().collect();
                for part in chars.chunks(max) {
                    let mut s: String = part.iter().collect();
                    flush(&mut s, &mut 0usize, &mut first);
                }
            } else {
                cur.push_str(&sentence);
                cur_len += n;
            }
        }
        flush(&mut cur, &mut cur_len, &mut first);
    }
    pieces
}

async fn google(c: &Client, text: &str, sl: &str, tl: &str) -> Result<(String, Option<String>), String> {
    let resp = c
        .get(GOOGLE_URL)
        .query(&[("client", "gtx"), ("sl", sl), ("tl", tl), ("dt", "t"), ("q", text)])
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| e.without_url().to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }
    let v: Value = resp.json().await.map_err(|e| e.to_string())?;
    let mut out = String::new();
    if let Some(arr) = v.get(0).and_then(|x| x.as_array()) {
        for item in arr {
            if let Some(part) = item.get(0).and_then(|x| x.as_str()) {
                out.push_str(part);
            }
        }
    }
    if out.trim().is_empty() {
        return Err("empty answer".to_string());
    }
    let detected = v.get(2).and_then(|x| x.as_str()).map(String::from);
    Ok((out, detected))
}

fn decode_entities(s: &str) -> String {
    s.replace("&#39;", "'")
        .replace("&quot;", "\"")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}

async fn mymemory(c: &Client, text: &str, sl: &str, tl: &str) -> Result<String, String> {
    let src = if sl == "auto" { "Autodetect" } else { sl };
    let pair = format!("{}|{}", src, tl);
    let resp = c
        .get(MYMEMORY_URL)
        .query(&[("q", text), ("langpair", pair.as_str())])
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| e.without_url().to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }
    let v: Value = resp.json().await.map_err(|e| e.to_string())?;
    let out = v
        .pointer("/responseData/translatedText")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let upper = out.to_uppercase();
    if out.is_empty() || upper.contains("MYMEMORY WARNING") || upper.contains("PLEASE SELECT TWO DISTINCT") {
        let detail = v.get("responseDetails").and_then(|x| x.as_str()).unwrap_or("");
        return Err(if detail.is_empty() { out } else { detail.to_string() });
    }
    Ok(decode_entities(&out))
}

pub async fn translate(c: &Client, r: &TranslateRequest) -> Result<TranslateResult, String> {
    let normalized = r.text.replace("\r\n", "\n");
    let text = normalized.trim();
    if text.is_empty() {
        return Ok(TranslateResult { text: String::new(), detected: None, engine: "none".into() });
    }
    let sl = if r.source.trim().is_empty() { "auto" } else { r.source.trim() };
    let tl = if r.target.trim().is_empty() { "bn" } else { r.target.trim() };
    if sl == tl {
        return Ok(TranslateResult { text: text.to_string(), detected: None, engine: "none".into() });
    }

    let mut out = String::new();
    let mut detected: Option<String> = None;
    let mut engine = "google";

    for piece in split_text(text, CHUNK) {
        out.push_str(piece.sep);
        if piece.text.trim().is_empty() {
            continue; // blank line stays blank
        }
        let mut google_err = String::new();
        let mut done = false;
        for attempt in 0..2 {
            match google(c, &piece.text, sl, tl).await {
                Ok((t, d)) => {
                    out.push_str(&t);
                    if detected.is_none() {
                        detected = d;
                    }
                    done = true;
                    break;
                }
                Err(e) => {
                    google_err = e;
                    if attempt == 0 {
                        tokio::time::sleep(Duration::from_millis(300)).await;
                    }
                }
            }
        }
        if !done {
            match mymemory(c, &piece.text, sl, tl).await {
                Ok(t) => {
                    out.push_str(&t);
                    engine = "mymemory";
                }
                Err(e) => {
                    return Err(format!(
                        "Translation failed. Google: {}. MyMemory: {}. Check your internet connection and try again.",
                        google_err, e
                    ));
                }
            }
        }
    }
    Ok(TranslateResult { text: out, detected, engine: engine.to_string() })
}
