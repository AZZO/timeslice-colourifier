// ==UserScript==
// @name         Timeslice Colourifier
// @namespace    com.azzo.timeslice
// @version      1.0
// @description  Apply per-job colouring to timeslice time slices
// @author       Cary Symes
// @match        https://go.timeslice.io/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=timeslice.io
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/arrive/2.4.1/arrive.min.js
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_listValues
// ==/UserScript==

const jobSearch = /Job: (J\d+)/;
const taskSearch = /Task: (.*)/;
const cssSanitiser = /\W+/gi;

// courtesy of https://stackoverflow.com/a/44615197/1543908
const hexToLuma = (colour) => {
    const r = parseInt(colour.substr(1, 2), 16);
    const g = parseInt(colour.substr(3, 2), 16);
    const b = parseInt(colour.substr(5, 2), 16);

    return [
        0.299 * r,
        0.587 * g,
        0.114 * b
    ].reduce((a, b) => a + b) / 255;
};
const hexToComplement = (colour, luma) => {
    const diff =
        luma < 0.5 ?
            255 * Math.exp(-luma) :
            -Math.exp(luma * Math.log(255));

    let r = parseInt(colour.substr(1, 2), 16) + diff;
    let g = parseInt(colour.substr(3, 2), 16) + diff;
    let b = parseInt(colour.substr(5, 2), 16) + diff;

    r = ((r < 255) ? parseInt(r) : 255).toString(16);
    g = ((g < 255) ? parseInt(g) : 255).toString(16);
    b = ((b < 255) ? parseInt(b) : 255).toString(16);

    r = r.length == 1 ? ("0" + r) : r
    g = g.length == 1 ? ("0" + g) : g
    b = b.length == 1 ? ("0" + b) : b

    return `#${r}${g}${b}`;
};
// courtesy of https://stackoverflow.com/a/49975078/1543908
function rgbToHex(orig) {
    var rgb = orig.replace(/\s/g, '').match(/^rgba?\((\d+),(\d+),(\d+),?([^,\s)]+)?/i),
        alpha = (rgb && rgb[4] || "").trim(),
        hex = rgb ?
            (rgb[1] | 1 << 8).toString(16).slice(1) +
            (rgb[2] | 1 << 8).toString(16).slice(1) +
            (rgb[3] | 1 << 8).toString(16).slice(1) : orig;

    return hex;
}
function setAndStoreValue(label, value) {
    // decide on a text colour that will give good contrast
    var luma = hexToLuma(value);
    var altColour = hexToComplement(value, luma);

    // TODO edit existing style if present
    GM_addStyle(`.${label} {background-color: ${value} !important; color: ${altColour} !important;}`);
    GM_addStyle(`.${label} .day-event-tube {border-color: ${altColour} !important;}`);

    // update the value in the store
    GM_setValue(label, value);
}


(function () {
    'use strict';

    var $ = window.jQuery;

    function closePicker() {
        //if($('.colour-picker').prop('job') == label) return;
        $('.colour-modal').remove();
    }

    function popupEditModal(evt, label, defColour) {
        // create a colour picker node
        var picker = $(document.createElement('input'))
        picker.addClass('colour-picker');
        picker.prop('type', 'color');
        picker.prop('job', label);

        // set value (storage and style)
        picker.on('input', function (cole) {
            var value = cole.target.value;
            setAndStoreValue(label, value);
        });

        // set value based on current/default
        var prevColour = GM_getValue(label, defColour);
        picker.prop('value', prevColour);

        // offset to ensure mouse is over it
        picker.css('left', evt.originalEvent.clientX - 10);
        picker.css('top', evt.originalEvent.clientY - 15);

        // create modal to detect mouse out
        var modal = $(document.createElement('div'));
        modal.addClass('colour-modal');
        modal.mousemove(closePicker);
        // destroy the picker when the modal detects mouse movement (i.e. it's outside the picker)

        $('body').append(modal);
        modal.append(picker);
        picker.click(); // auto open the picker instead of showing the input field
    }

    function handleSliceNode(dayNode) {
        // determine job ID and add it as a class for our colouring to apply
        var job = dayNode.prop('title').match(jobSearch);
        var task = dayNode.prop('title').match(taskSearch);
        if (job == null || task == null) return;
        // combine job and task for ids to ensure proper grouping
        var label = (job[1] + '_' + task[1]).replace(cssSanitiser, '_');
        dayNode.addClass(label);

        // determine original colour - convert rgb() to hex and use as default
        var defColour = rgbToHex(dayNode.css('background-color'));



        // create a colour picker trigger
        var el = $(document.createElement('div'))
        el.prop('title', 'Edit job colour');
        el.addClass('colour-editor');
        el.mouseenter(function (e) { popupEditModal(e, label, defColour) }); // attach to the colour picker trigger
        dayNode.append(el);
    }

    // add style for colour editors to use
    GM_addStyle('.colour-editor {background-color: lightgray; width: 12px; height: 12px; position: absolute; top: 2px; right: 15px; border-radius: 2px;}');
    GM_addStyle('.colour-picker {position: absolute; opacity: 0; height: 0;}');
    GM_addStyle('.colour-modal {position: absolute; left: 0; top: 0; right: 0; bottom: 0; background-color: black; opacity: 0.0;}');

    // enumerate stored values and add styles
    var savedValues = GM_listValues();
    for (let key of savedValues) {
        var savedColour = GM_getValue(key);
        setAndStoreValue(key, savedColour);
    }

    // I don't understand what Timeslice is doing, but you need to listen to 'leave' instead of 'arrive'
    $(document).leave('.day-event', function () {
        handleSliceNode($(this));
    });
})();
