/* 유니콘랩 홈페이지 — 헤더 상태 · 등장 모션 · 프로세스 진행선 */
(function () {
  'use strict';

  var reduced = window.matchMedia &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- 스크롤하면 헤더가 밝은 배경으로 바뀐다 ---- */
  var header = document.getElementById('siteHeader');
  function onScroll() {
    if (!header) return;
    header.classList.toggle('is-solid', window.scrollY > 40);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---- 화면에 들어오면 나타나는 모션 ---- */
  var targets = document.querySelectorAll('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(targets, function (el) {
      el.classList.add('is-in');
    });
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });

  Array.prototype.forEach.call(targets, function (el) { io.observe(el); });
})();


/* =========================================================
   문의 폼 — Web3Forms 로 전송 (페이지 이동 없이)
   ========================================================= */
(function () {
  'use strict';

  var form = document.getElementById('inquiryForm');
  if (!form) return;

  var status = document.getElementById('formStatus');
  var button = form.querySelector('.form-submit');
  var buttonText = button ? button.textContent : '문의 보내기 →';

  function say(msg, kind) {
    if (!status) return;
    status.textContent = msg;
    status.className = 'form-status is-on ' + (kind === 'ok' ? 'is-ok' : 'is-err');
  }
  function clearSay() {
    if (status) status.className = 'form-status';
  }

  /* 첫 번째로 비어 있는 필수 항목을 찾아 표시한다 */
  function firstInvalid() {
    var fields = form.querySelectorAll('[required]');
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var empty = (f.type === 'checkbox') ? !f.checked : !f.value.trim();
      if (empty || !f.checkValidity()) return f;
    }
    return null;
  }

  form.addEventListener('input', function (e) {
    if (e.target.classList) e.target.classList.remove('is-invalid');
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearSay();

    Array.prototype.forEach.call(form.querySelectorAll('.is-invalid'), function (el) {
      el.classList.remove('is-invalid');
    });

    var bad = firstInvalid();
    if (bad) {
      bad.classList.add('is-invalid');
      bad.focus();
      say(bad.type === 'checkbox'
        ? '개인정보 수집 · 이용에 동의해 주셔야 문의를 보낼 수 있습니다.'
        : '필수 항목을 확인해 주세요.', 'err');
      return;
    }

    var data = new FormData(form);
    var key = data.get('access_key');
    if (!key || String(key).indexOf('WEB3FORMS') === 0) {
      say('문의 접수 설정이 아직 완료되지 않았습니다. info@nextio.ai.kr 로 메일 주시면 바로 답변드리겠습니다.', 'err');
      return;
    }

    if (button) { button.disabled = true; button.textContent = '보내는 중…'; }

    fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      body: data
    })
      .then(function (res) { return res.json().catch(function () { return {}; }); })
      .then(function (json) {
        if (json && json.success) {
          form.reset();
          say('문의가 접수되었습니다. 1~2 영업일 안에 답변드리겠습니다. 감사합니다.', 'ok');
        } else {
          say('전송에 실패했습니다. 잠시 후 다시 시도해 주시거나 info@nextio.ai.kr 로 메일 주세요.', 'err');
        }
      })
      .catch(function () {
        say('네트워크 오류로 전송하지 못했습니다. info@nextio.ai.kr 로 메일 주시면 바로 답변드리겠습니다.', 'err');
      })
      .then(function () {
        if (button) { button.disabled = false; button.textContent = buttonText; }
      });
  });
})();
