/*
 * SKEAM SDK: lets an HTML game talk to the SKEAM player it runs inside.
 *
 *   <script src=".../skeam-sdk.js"></script>
 *   SKEAM.unlock('first_win')   // achievement unlocked
 *   SKEAM.inSkeam               // true when running inside SKEAM
 *
 * Outside SKEAM every call is a harmless no-op, so the same build still
 * works on its own GitHub Pages address.
 */
(function () {
  var parent = window.parent !== window ? window.parent : null
  function send(msg) {
    if (parent) parent.postMessage(msg, '*')
  }
  window.SKEAM = {
    inSkeam: !!parent,
    unlock: function (id) {
      send({ skeam: 'unlock', id: String(id) })
    },
    openOverlay: function () {
      send({ skeam: 'overlay' })
    },
  }
  // Shift+Tab inside the game opens the SKEAM overlay, like Steam.
  window.addEventListener(
    'keydown',
    function (e) {
      if (parent && e.key === 'Tab' && e.shiftKey) {
        e.preventDefault()
        send({ skeam: 'overlay' })
      }
    },
    true,
  )
})()
