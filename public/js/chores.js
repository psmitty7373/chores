var cropper = null
var kids_db = []

var formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function view_kid(kid) {
    console.log('v');
}

function view_chore(chore) {
    console.log('c');
}

function assign(kid, chore) {
    let data = { action: 'update', chore_name: chore, chore_assignment: kid }
    ajax('/chore', data, function() { location.reload() })
}

function update_image(input, element_id) {
    if (input.files && input.files[0]) {
        let reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById(element_id).src = e.target.result
            init_cropper(element_id);
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function init_cropper(element_id){
    let image = document.getElementById(element_id);
    cropper = new Cropper(image, {
      aspectRatio: 1 / 1,
      crop: function(e) {
        //console.log(e.detail.x);
        //console.log(e.detail.y);
      }
    });
}

function ajax(url, data, callback) {
    let resp = fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/JSON'
        },
        body: JSON.stringify(data)
    })
    .then(function(res) {
        return res.json()
    })
    .then(function(resp) {
         if (resp.status) {
            if (resp.status == 'success' && callback) {
                return callback();
            }
        }
    })
}

document.addEventListener('DOMContentLoaded', function(event) {
    if (document.getElementById('kid-form')) {
        document.forms['kid-form'].addEventListener('submit', (event) => {
            event.preventDefault()
            const formData = Object.fromEntries(new FormData(event.target))

            if (cropper) {
                formData.kid_image = cropper.getCroppedCanvas({width: 640, height:480}).toDataURL()
            }

            ajax('/kid', formData, function() { location.reload() });

            bootstrap.Modal.getInstance(document.getElementById('kid-modal')).hide()
        });
    }

    if (document.getElementById('chore-form')) {
        document.forms['chore-form'].addEventListener('submit', (event) => {
            event.preventDefault()
            const formData = Object.fromEntries(new FormData(event.target))

            if (cropper) {
                formData.chore_image = cropper.getCroppedCanvas({width: 640, height:480}).toDataURL()
            }

            ajax('/chore', formData, function() { location.reload() });

            if (bootstrap.Modal.getInstance(document.getElementById('chore-modal')))
                bootstrap.Modal.getInstance(document.getElementById('chore-modal')).hide()
        })
    }

    if (document.getElementById('chore-finish-form')) {
        document.forms['chore-finish-form'].addEventListener('submit', (event) => {
            event.preventDefault()
            const formData = Object.fromEntries(new FormData(event.target))

            if (cropper) {
                formData.chore_image = cropper.getCroppedCanvas({width: 640, height:480}).toDataURL()
            }

            ajax('/finish', formData, function() { location.reload() });

            if (bootstrap.Modal.getInstance(document.getElementById('chore-finish-modal')))
                bootstrap.Modal.getInstance(document.getElementById('chore-finish-modal')).hide()
        })
    }

})
