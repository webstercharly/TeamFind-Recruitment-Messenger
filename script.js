const BASE = 'https://teamfind.com';
const URLS = {
  BASE,
  PROFILE: `${BASE}/user/{userId}/{game}?ref=from_p`,
  GET_PROFILE: `${BASE}/api/v1/user?ids={userId}`,
  GET_PLAYER_POST: `${BASE}/api/v1/player?game={game}&userId={userId}`,
  GET_PLAYERS: `${BASE}/api/v1/player?game={game}`, //&minAge=16`
  GET_COMMENTS: `${BASE}/api/v1/user/{userId}/comment?game={game}&limit=12`,
  POST_COMMENT: `${BASE}/api/v1/user/{userId}/comment`,
};

const GAMES = {
  lol: 'league-of-legends',
  csgo: 'counter-strike',
};

function submitForm() {
  const textareaValue = document.getElementById('myTextArea').value;
  const siteAuthToken = document.getElementById('siteAuthToken').value;
  const arAmount = parseInt(document.getElementById('arAmount').value);
  return wrapper('csgo', arAmount, textareaValue, siteAuthToken);
}

async function wrapper(section, arAmount, arMessage, siteAuthToken) {
  try {
    return await run(section, arAmount, arMessage, siteAuthToken);
  } catch (ex) {
    console.log(ex);
    return ex;
  }
}

async function run(section, arAmount, arMessage, siteAuthToken) {
  const completedAr = [];
  let errorCount = 0;
  let error = '';
  setAuthedHeaders(siteAuthToken);
  let nextUrl = getGamePlayersUrl(section);

  while (nextUrl) {
    if (completedAr.length === arAmount || errorCount === 5) {
      console.log('errorCount', errorCount);
      console.log('completedAr', completedAr);
      break;
    }
    const availableUsers = await getUsersByUrl(nextUrl);

    if (availableUsers.success) {
      const { players, nextUrl: _nextUrl } = availableUsers;
      for (let index in players) {
        if (completedAr.length === arAmount) {
          break;
        }
        const player = players[index];
        const {
          user: { idStr, name, country, ranks },
        } = player;
        let rank;
        if (ranks) {
          rank = ranks[0] && ranks[0].rank;
        }

        const postable = await isPlayerPostable(section, idStr);

        if (postable) {
          const commentResult = await sendMessageToUser(
            section,
            idStr,
            arMessage,
          );

          if (commentResult.success) {
            errorCount = 0;
            const playerInfo = {
              siteUserUid: idStr || null,
              siteUsername: name || null,
              siteUserLink: getUserProfileUrl(idStr, section) || null,
            };
            completedAr.push(playerInfo);
          } else {
            error = commentResult;
            errorCount = errorCount + 1;
          }
        }
      }
      nextUrl = _nextUrl ? BASE + _nextUrl.href : null;
    } else {
      return {
        completedAr,
        ...availableUsers,
        errorCount,
        ...error,
      };
    }
  }

  alert("Success: " + completedAr.length ? true : false)
  return {
    completedAr,
    success: completedAr.length ? true : false,
    statusText: completedAr.length ? 'success' : 'no users contacted',
    status: 200,
  };
}

const headers = {
  Host: 'teamfind.com',
  Connection: 'keep-alive',
  'Accept-Language':
    'en-US,en;q=0.9,en-GB;q=0.8,zh-TW;q=0.7,zh-CN;q=0.6,zh;q=0.5',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36',
  Cookie:
    'ajs_user_id=null; ajs_group_id=null; ajs_anonymous_id=%22ab90563b-4e44-4e07-884d-3180f41683e1%22; __stripe_mid=be3cc7c8-a07f-47f9-b172-cdfcc60fbbac',
  'Content-Type': 'application/json',
  'Accept-Encoding': 'gzip, deflate',
};

function setAuthedHeaders(authorization) {
  headers['X-Auth-Token'] = authorization;
}

async function isPlayerPostable(section, userId) {
  const comments = await getAllComments(section, userId);
  for (let index in comments) {
    const commentObj = comments[index];
    const {
      comment,
      comment: { createdAt },
    } = commentObj;
    const isPostable = !containsCV(comment);
    if (!isPostable) {
      return false;
    }
  }
  return true;
}

async function getAllComments(section, userId) {
  const { GET_COMMENTS } = URLS;
  const game = GAMES[section];
  let nextUrl = format(GET_COMMENTS, { userId, game });
  let allComments = [];

  while (nextUrl) {
    const { comment, nextUrl: _nextUrl } = await getCommentsByUrl(nextUrl);
    if (comment && comment.length) {
      allComments = allComments.concat(comment);
    }
    nextUrl = _nextUrl ? BASE + _nextUrl.href : null;
  }
  return allComments;
}

async function sendMessageToUser(section, userId, message) {
  const { POST_COMMENT } = URLS;
  const postCommentUrl = format(POST_COMMENT, { userId });
  const bodyData = {
    to_user_id: userId,
    game: section,
    comment: message,
    rating: 5,
  };
  const requestHelper = new RequestHelper(headers);
  const response = await requestHelper.post(postCommentUrl, bodyData);

  if (response.error) {
    response.method = 'sendMessageToUser';
    return response;
  }
  return {
    success: true,
  };
}

async function getCommentsByUrl(url) {
  const requestHelper = new RequestHelper(headers);
  const response = await requestHelper.get(url);

  if (response.error) {
    response.method = 'getCommentsByUrl';
    return response;
  }

  const postJson = await response.json();
  const { _embedded, _links } = postJson;
  const { comment } = _embedded;
  return {
    comment: comment || [],
    nextUrl: (_links && _links.next) || null,
    success: true,
  };
}

async function getUsersByUrl(url) {
  const requestHelper = new RequestHelper(headers);
  const response = await requestHelper.get(url);

  if (response.error) {
    response.method = 'getUsersByUrl';
    return response;
  }

  const postJson = await response.json();

  const { _embedded, _links } = postJson;
  const { player } = _embedded;
  const { next } = _links;

  if (player && player.length) {
    return {
      players: player,
      nextUrl: (next && `${URLS.BASE}${next.href}`) || '',
      success: true,
    };
  }
  return {
    status: 404,
    statusText: 'NOT FOUND',
    error: `Caught exception: No players were found`,
    method: 'getUsersByUrl',
    success: false,
  };
}

function containsCV(string) {
  const keywords = ['returning player'];
  const lowerCaseString = string.toLowerCase();
  return keywords.some((keyword) => lowerCaseString.indexOf(keyword) !== -1);
}

function getUserProfileUrl(userId, game) {
  const { PROFILE } = URLS;
  return format(PROFILE, { userId, game });
}

function getGamePlayersUrl(section) {
  const { GET_PLAYERS } = URLS;
  const game = GAMES[section];
  return format(GET_PLAYERS, { game });
}

class RequestHelper {
  constructor(headers, timeout = 60000) {
    this.timeout = timeout;
    this.headers = headers;
  }

  setHeaders(headers) {
    this.headers = headers;
  }

  async get(url) {
    const options = {
      method: 'GET',
      headers: this.headers,
    };
    try {
      const response = await this.wait(fetch(url, options), this.timeout);
      if (!response.ok) {
        throw response;
      }
      return response;
    } catch (ex) {
      console.log(ex);
      return {
        ...ex,
        error: `Caught exception: GET ${url}`,
        success: false,
      };
    }
  }

  async post(url, bodyData) {
    const options = {
      method: 'POST',
      body: bodyData ? JSON.stringify(bodyData) : '',
      headers: this.headers,
    };
    try {
      const response = await this.wait(fetch(url, options), this.timeout);
      const contentType = response.headers.get('content-type');
      const isJson =
        contentType && contentType.indexOf('application/json') !== -1;
      if (!response.ok) {
        let json = {};
        if (isJson) {
          json = await response.json();
        }
        throw {
          ...json,
          status: response.status,
          statusText: response.statusText,
          error: `Caught exception: POST ${url}`,
          requestBody: JSON.stringify(bodyData),
          success: false,
        };
      }
      if (isJson) {
        return await response.json();
      }
      return {
        status: response.status,
        statusText: response.statusText,
        success: true,
      };
    } catch (ex) {
      console.log(ex);
      return {
        ...ex,
        error: `Caught exception: POST ${url}`,
        requestBody: JSON.stringify(bodyData),
        success: false,
      };
    }
  }

  wait(promise, delayInMilliseconds = 6000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Request timed out'));
      }, delayInMilliseconds);

      promise.then(
        (res) => {
          clearTimeout(timer);
          resolve(res);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }
}
function ValueError(message) {
  var err = new Error(message);
  err.name = 'ValueError';
  return err;
}

function create(transformers) {
  return function (template) {
    var args = Array.prototype.slice.call(arguments, 1);
    var idx = 0;
    var state = 'UNDEFINED';

    return template.replace(
      /([{}])\1|[{](.*?)(?:!(.+?))?[}]/g,
      function (match, literal, _key, xf) {
        if (literal != null) {
          return literal;
        }
        var key = _key;
        if (key.length > 0) {
          if (state === 'IMPLICIT') {
            throw ValueError(
              'cannot switch from ' + 'implicit to explicit numbering',
            );
          }
          state = 'EXPLICIT';
        } else {
          if (state === 'EXPLICIT') {
            throw ValueError(
              'cannot switch from ' + 'explicit to implicit numbering',
            );
          }
          state = 'IMPLICIT';
          key = String(idx);
          idx += 1;
        }

        var path = key.split('.');
        var value = (/^\d+$/.test(path[0]) ? path : ['0'].concat(path))
          .reduce(
            function (maybe, key) {
              return maybe.reduce(function (_, x) {
                return x != null && key in Object(x)
                  ? [typeof x[key] === 'function' ? x[key]() : x[key]]
                  : [];
              }, []);
            },
            [args],
          )
          .reduce(function (_, x) {
            return x;
          }, '');

        if (xf == null) {
          return value;
        } else if (Object.prototype.hasOwnProperty.call(transformers, xf)) {
          return transformers[xf](value);
        } else {
          throw ValueError('no transformer named "' + xf + '"');
        }
      },
    );
  };
}

var format = create({});
format.create = create;

format.extend = function (prototype, transformers) {
  var $format = create(transformers);
  prototype.format = function () {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(this);
    return $format.apply(this, args);
  };
};
