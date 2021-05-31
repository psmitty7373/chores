var cropper = null

async function get_kids() {
    var resp = fetch('/kids', {
        method: 'GET'
    })
    .then(function(res) {
        return res.json()
    })
    .then(function(kids) {
        if (kids.length > 0) {
            var html = ''
            for (var i = 0; i < kids.length; i++) {
                html += `<div class="col-lg-3 col-md-4 col-sm-6"><div class="card"><img src="imagestore/${kids[i].picture}"><div class="card-body"><h5 class="card-title">${kids[i].username}</h5><p>${kids[i].description}</p></div></div></div>`
            }
            document.getElementById('kids').innerHTML = html
        }
    })
}

function update_image(input, element_id) {
    if (input.files && input.files[0]) {
        var reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById(element_id).src = e.target.result
            init_cropper(element_id);
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function init_cropper(element_id){
    var image = document.getElementById(element_id);
    cropper = new Cropper(image, {
      aspectRatio: 4 / 3,
      crop: function(e) {
        //console.log(e.detail.x);
        //console.log(e.detail.y);
      }
    });
}

document.addEventListener('DOMContentLoaded', function(event) {
    document.forms['kid-form'].addEventListener('submit', (event) => {
        event.preventDefault()
        const formData = Object.fromEntries(new FormData(event.target))

        formData.kid_picture = cropper.getCroppedCanvas({width: 640, height:480}).toDataURL()
        //document.getElementById("cropped_result").appendChild(img);

        var resp = fetch('/new-kid', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/JSON'
            },
            body: JSON.stringify(formData)
        })
        .then(function(res) {

        })
        .then(function(text) {
            console.log(text)
        })

        bootstrap.Modal.getInstance(document.getElementById('kid-modal')).hide()
    });

    document.forms['chore-form'].addEventListener('submit', (event) => {
        event.preventDefault()
        const formData = Object.fromEntries(new FormData(event.target))
        var resp = fetch('/new-chore', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/JSON'
            },
            body: JSON.stringify(formData)
        })
        .then(function(res) {

        })
        .then(function(text) {
            console.log(text)
        })

        bootstrap.Modal.getInstance(document.getElementById('chore-modal')).hide()
    });

    get_kids()
})
