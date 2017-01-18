let options;

(function()
{
  let background_page = chrome.extension.getBackgroundPage();

  let add_domain_to_profile = background_page.add_domain_to_profile;
  let remove_domain_from_profile = background_page.remove_domain_from_profile;

  let update_profile_table = background_page.update_profile_table;

  let get_profile_id = background_page.get_profile_id;
  let get_template_ids = background_page.get_template_ids;

  let get_options = background_page.get_options;
  let set_options = background_page.set_options;

  // TODO: remove;
  let storage_l = chrome.storage.local;

  let profile_id;
  let caller_domain;


  function initial_master_switch(enabled)
  {
    $('#master-switch').text(enabled ? 'Enabled' : 'Disabled').click(function()
    {
      if ($(this).text() == 'Enabled')
      {
        storage_l.set({'enabled' : false});
        $(this).text('Disabled');
      }
      else
      {
        storage_l.set({'enabled' : true})
        $(this).text('Enabled');
      }
    });
  }

  function on_option_page_clicked(event)
  {
    if ($(this).hasClass('active'))
      return;

    $('.option-page.active').removeClass('active');
    $(this).addClass('active');
  }

  function update_option(id, value)
  {
    if (options[id] === value)
      return;

    if (value === undefined)
      delete options[id];
    else
      options[id] = value;

    set_options(profile_id, options);
  }

  function on_editable_span_paste(event)
  {
    clipboard_data = event.originalEvent.clipboardData;

    if (clipboard_data && clipboard_data.getData)
      document.execCommand("insertHTML", false, clipboard_data.getData("text/plain"));

    return event.preventDefault();
  }

  function select_span_text(element)
  {
    let selection = window.getSelection();
    let range = document.createRange();
    range.setStartBefore(element.childNodes[0]);
    range.setEndAfter(element.childNodes[0]);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function install_boolean_option(element, id, value)
  {
    let set_value;

    const $element = $(element);

    $element
      .attr('tabindex', '0');

    function switch_value()
    {
      var new_value;

      if ($element.attr('sk-value-undefined') !== undefined)
        new_value = true;
      else
        new_value = $element.attr('sk-value') == 'false' ? undefined : false;

      update_option(id, new_value);

      set_value(new_value);
    }

    set_value = function(value)
    {
      if (value === undefined)
        $element
          .removeAttr('sk-value')
          .attr('sk-value-undefined', '')
          .text('default')
      else
        $element
          .removeAttr('sk-value-undefined')
          .attr('sk-value', value ? true : false)
          .text(value ? 'true' : 'false')

      $element
        .unbind('click')
        .click(switch_value)
        .unbind('keypress')
        .keypress(function(event)
        {
          if (event.which == '13')
            switch_value();
        });
    };

    set_value(value);
  }

  function install_text_option(element, id, value)
  {
    let set_default;
    let set_text;

    const $element = $(element);

    $element
      .attr('tabindex', '0');

    set_default = function()
    {
      $element
        .removeAttr('contenteditable')
        .removeAttr('sk-value-text')
        .attr('sk-value-undefined', '')
        .text('default')
        .unbind('focus')
        .unbind('paste')
        .focus(function(event)
        {
          set_text('default');

          select_span_text(element);
        });
    };

    set_text = function(text)
    {
      $element
        .attr('contenteditable', '')
        .attr('sk-value-text', '')
        .removeAttr('sk-value-undefined')
        .text(text)
        .unbind('focus')
        .bind('paste', on_editable_span_paste)
        .focus(function()
        {
          select_span_text(element);
        })
        .focusout(function()
        {
          let text = $(this).text().replace(/;.*$/, '').trim();
          let value = (text == 'default') ? undefined : text;

          if (value === undefined)
            set_default();

          update_option(id, value)

          window.getSelection().removeAllRanges();
        })
        .keypress(function(event)
        {
          if (event.which == '13')
          {
            let text = $(this).text().replace(/;.*$/, '').trim();
            let value = (text == 'default') ? undefined : text;

            update_option(id, value)

            event.preventDefault();
          }
        });
    }
    
    if (value === undefined)
      set_default();
    else
      set_text(value);
  }

  function initial_controls()
  {
    $('.boolean-option').each(function()
    {
      let id = $(this).attr('sk-value-id');

      if (id)
        install_boolean_option(this, id, options[id]);
    });

    $('.text-option').each(function()
    {
      let id = $(this).attr('sk-value-id');

      if (id)
        install_text_option(this, id, options[id]);
    });
  }

  function install_profile_selection()
  {
    $('#profile-selection .span-button')
    .each(function()
    {
      if ($(this).attr('sk-profile-id') == profile_id)
        $(this).addClass('active');
      else
        $(this).removeClass('active');
    })
    .click(function()
    {
      if ($(this).hasClass('active'))
        return;

      remove_domain_from_profile(caller_domain, profile_id);

      profile_id = $(this).attr('sk-profile-id');

      add_domain_to_profile(caller_domain, profile_id)

      update_profile_table();

      $('#profile-selection .span-button.active').removeClass('active');
      $(this).addClass('active');

      get_options(profile_id, function(got)
      {
        options = got;

        initial_controls();
      });

      chrome.tabs.query({active: true, currentWindow: true},
        function(tabs)
        {
          chrome.tabs.sendMessage(
            tabs[0].id,
            {
              'profile-updated' : true,
            });
        });
    });
  }

  function export_options()
  {
    if (profile_id == 'disabled')
    {
      $('#options-code').text('This profile is locked.');

      return;
    }

    let code = LZString.compressToBase64(JSON.stringify(options));

    $('#options-code').text('SK[' + code + ']').each(function()
    {
      select_span_text(this);
    });
  }

  const options_code_pattern = /SK\[([\w\/+=]*)\]/;

  function import_options()
  {
    if (profile_id == 'disabled')
    {
      $('#options-code').text('This profile is locked.');

      return;
    }

    let code = $('#options-code').text();

    code.replace(options_code_pattern, function(full_match, base64code)
    {
      options = JSON.parse(LZString.decompressFromBase64(base64code));

      set_options(profile_id, options);

      initial_controls();
    });
  }


  $(function()
  {
    $('.option-page').click(on_option_page_clicked);

    chrome.tabs.query({active: true, currentWindow: true},
      function(tabs)
      {
        let url = tabs[0].url;

        if (get_template_ids(url).length == 0)
        {
          $('#warning-container').addClass('shown');

          return;
        }

        profile_id = get_profile_id(url);

        caller_domain = undefined;

        url.replace(/https?:\/\/(?:[^\/]*@)?([^\/:]*)(?::[\d]*)?\/.*/, function(full_match, domain)
        {
          caller_domain = domain;
        });

        install_profile_selection();

        get_options(profile_id, function(got)
        {
          options = got;

          initial_controls();

          $('[action=\'export-options\']').click(export_options);
          $('[action=\'import-options\']').click(import_options);
        });
      });
    
    storage_l.get('enabled', function(data)
    {
      initial_master_switch(data['enabled']);
    });
  });

})();

