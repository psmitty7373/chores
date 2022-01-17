var cropper = null
var users_db = []

var formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function toast(msg) {
    var toast = bootstrap.Toast.getInstance(document.querySelector('.toast'))
    if (toast) {
        document.getElementById('toast-body').innerHTML = msg
        toast.show()
    }
}

function hide_modal(modal) {
    if (bootstrap.Modal.getInstance(document.getElementById(modal))) {
        bootstrap.Modal.getInstance(document.getElementById(modal)).hide()
    }
}

function toggle_internet(user_id, status) {
    let data = { action: 'toggle_internet', user_id: user_id, status: status }
    ajax('/user', data, function() { location.reload() })
}

function assign(user_id, chore_id) {
    let data = { action: 'update', chore_id: chore_id, chore_assignment: user_id }
    ajax('/chore', data, function() { location.reload() })
}

function approve(user, chore_id) {
    console.log(user, chore_id);
    let data = { action: 'approve', chore_log_id: chore_id }
    ajax('/chore_log', data, function() { location.reload() })
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
            } else {
                if (resp.errors) {
                    let msg = ''
                    for (let i = 0; i < resp.errors.length; i++) {
                        if (resp.errors[i].msg) {
                            msg += resp.errors[i].msg
                        }
                    }
                    toast(msg)
                }
            }
        }
    })
}

document.addEventListener('DOMContentLoaded', function(event) {
    if (document.getElementById('user-form')) {
        document.forms['user-form'].addEventListener('submit', (event) => {
            event.preventDefault()
            const formData = Object.fromEntries(new FormData(event.target))

            if (cropper) {
                formData.user_image = cropper.getCroppedCanvas({width: 640, height:480}).toDataURL()
            }

            ajax('/user', formData, function() { location.reload() })

            hide_modal('user-modal')
        })
    }

    if (document.getElementById('chore-form')) {
        document.forms['chore-form'].addEventListener('submit', (event) => {
            event.preventDefault()
            const formData = Object.fromEntries(new FormData(event.target))

            if (!formData.chore_internet) {
                formData.chore_internet = false
            }

            if (cropper) {
                formData.chore_image = cropper.getCroppedCanvas({width: 640, height:480}).toDataURL()
            }

            ajax('/chore', formData, function() { location.reload() })

        })
    }

    if (document.getElementById('chore-finish-form')) {
        document.forms['chore-finish-form'].addEventListener('submit', (event) => {
            event.preventDefault()
            const formData = Object.fromEntries(new FormData(event.target))

            if (cropper) {
                formData.chore_image = cropper.getCroppedCanvas({width: 640, height:480}).toDataURL()
            }

            ajax('/chore', formData, function() { location.reload() })

            hide_modal('chore-finish-modal')
        })
    }

    if (document.getElementById('pay-form')) {
        document.forms['pay-form'].addEventListener('submit', (event) => {
            event.preventDefault()
            const formData = Object.fromEntries(new FormData(event.target))

            ajax('/pay_log', formData, function() { location.reload() })

            hide_modal('pay-modal')
        })
    }

    if (document.getElementById('spend-form')) {
        document.forms['spend-form'].addEventListener('submit', (event) => {
            event.preventDefault()
            const formData = Object.fromEntries(new FormData(event.target))
            formData.pay_amount = parseFloat(formData.pay_amount.replace('$',''))

            if (formData.pay_amount > 0) {
                formData.pay_amount *= -1
            }

            formData.pay_amount = formData.pay_amount.toString()

            ajax('/pay_log', formData, function() { location.reload() })

            hide_modal('spend-modal')
        })
    }

    var toastElList = [].slice.call(document.querySelectorAll('.toast'))
    var toastList = toastElList.map(function (toastEl) {
        return new bootstrap.Toast(toastEl)
    })
})
