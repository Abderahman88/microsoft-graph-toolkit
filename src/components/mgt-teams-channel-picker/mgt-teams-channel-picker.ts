/**
 * -------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation.  All Rights Reserved.  Licensed under the MIT License.
 * See License in the project root for license information.
 * -------------------------------------------------------------------------------------------
 */

import { forStatement, templateElement } from '@babel/types';
import * as MicrosoftGraph from '@microsoft/microsoft-graph-types';
import { customElement, html, property, TemplateResult } from 'lit-element';
import { isTemplatePartActive } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat';
import { Providers } from '../../Providers';
import { ProviderState } from '../../providers/IProvider';
import '../../styles/fabric-icon-font';
import { getSvg, SvgIcon } from '../../utils/SvgHelper';
import { debounce } from '../../utils/Utils';
import '../mgt-person/mgt-person';
import { MgtTemplatedComponent } from '../templatedComponent';
import { styles } from './mgt-teams-channel-picker-css';
import { getAllMyTeams } from './mgt-teams-channel-picker.graph';

/**
 * Establishes Microsoft Teams channels for use in Microsoft.Graph.Team type
 * @type MicrosoftGraph.Team
 *
 */

type Team = MicrosoftGraph.Team & {
  /**
   * Display name Of Team
   *
   * @type {string}
   */
  displayName: string;
  /**
   * Microsoft Graph Channel
   *
   * @type {MicrosoftGraph.Channel[]}
   */
  channels: MicrosoftGraph.Channel[];
  /**
   * Determines whether Team displays channels
   *
   * @type {Boolean}
   */
  showChannels: boolean;
};

/**
 * Web component used to select channels from a User's Microsoft Teams profile
 *
 *
 * @class MgtTeamsChannelPicker
 * @extends {MgtTemplatedComponent}
 *
 * @cssprop --font-color - {font} Default font color
 *
 * @cssprop --input-border - {String} Input section entire border
 * @cssprop --input-border-top - {String} Input section border top only
 * @cssprop --input-border-right - {String} Input section border right only
 * @cssprop --input-border-bottom - {String} Input section border bottom only
 * @cssprop --input-border-left - {String} Input section border left only
 * @cssprop --input-background-color - {Color} Input section background color
 * @cssprop --input-hover-color - {Color} Input text hover color
 *
 * @cssprop --selection-background-color - {Color} Highlight of selected channel color
 * @cssprop --selection-hover-color - {Color} Highlight of selected channel color during hover state
 *
 * @cssprop --arrow-fill - {Color} Color of arrow svg
 * @cssprop --placeholder-focus-color - {Color} Highlight of placeholder text during focus state
 *
 */
@customElement('mgt-teams-channel-picker')
export class MgtTeamsChannelPicker extends MgtTemplatedComponent {
  /**
   * Array of styles to apply to the element. The styles should be defined
   * user the `css` tag function.
   */
  static get styles() {
    return styles;
  }

  /**
   * user's Microsoft joinedTeams
   *
   * @type {Team[]}
   * @memberof MgtTeamsChannelPicker
   */
  @property({
    attribute: 'teams',
    type: Object
  })
  public teams: Team[] = [];

  /**
   * user selected teams
   *
   * @type {any[]}
   * @memberof MgtTeamsChannelPicker
   */
  @property({
    attribute: 'selected-teams'
  })
  public selectedTeams: [Team[], MicrosoftGraph.Channel[]] = [[], []];

  /**
   *  array of user picked people.
   * @type {Array<any>}
   */
  @property({
    attribute: 'selected-channel',
    type: Array
  })
  public selectedChannel: MicrosoftGraph.Channel[] = [];

  // User input in search
  @property() private _userInput: string = '';

  @property() private _teamChannels: any[];

  private noChannelsFound: boolean = false;

  private noListShown: boolean = false;

  // tracking of user arrow key input for selection
  private arrowSelectionCount: number = -1;

  private channelLength: number = 0;

  private channelCounter: number = -1;

  private isHovered = false;

  private isFocused = false;

  // determines loading state
  @property() private isLoading = false;
  private debouncedSearch;

  constructor() {
    super();
    this.handleWindowClick = this.handleWindowClick.bind(this);
  }

  /**
   * Invoked each time the custom element is appended into a document-connected element
   *
   * @memberof MgtPerson
   */
  public connectedCallback() {
    super.connectedCallback();
    window.addEventListener('click', this.handleWindowClick);
  }

  /**
   * Invoked each time the custom element is disconnected from the document's DOM
   *
   * @memberof MgtPerson
   */
  public disconnectedCallback() {
    window.removeEventListener('click', this.handleWindowClick);
    super.disconnectedCallback();
  }

  /**
   * Queries the microsoft graph for a user based on the user id and adds them to the selectedPeople array
   *
   * @param {[string]} an array of user ids to add to selectedPeople
   * @returns {Promise<void>}
   * @memberof MgtPeoplePicker
   */
  public async selectChannelsById(channelIds: [string]): Promise<void> {
    const provider = Providers.globalProvider;
    const client = Providers.globalProvider.graph;
    if (provider && provider.state === ProviderState.SignedIn) {
      for (const team of this.teams) {
        for (const channel of team.channels) {
          if (channel.id === channelIds[0]) {
            try {
              this.selectedTeams = [[team], [channel]];
              // tslint:disable-next-line: no-empty
            } catch (e) {}
          }
        }
      }
    }
  }

  /**
   * Invoked on each update to perform rendering tasks. This method must return a lit-html TemplateResult.
   * Setting properties inside this method will not trigger the element to update.
   * @returns
   * @memberof MgtTeamsChannelPicker
   */
  public render() {
    return (
      this.renderTemplate('default', { teams: this.teams }) ||
      html`
        <div
          class="teams-channel-picker"
          @mouseover=${this.handleHover}
          @blur=${this.lostFocus}
          @mouseout=${this.mouseLeft}
        >
          <div
            class="teams-channel-picker-input ${this.isHovered ? 'hovered' : ''} ${this.isFocused ? 'focused' : ''}"
            @click=${this.gainedFocus}
          >
            <div class="search-icon ${this.isFocused && this.selectedTeams[0].length === 0 ? 'focused' : ''}">
              ${this.isFocused && this.selectedTeams[0].length === 0 ? getSvg(SvgIcon.Search, '#252424') : ''}
            </div>
            ${this.renderChosenTeam()}
          </div>
          ${this.renderTeamList()}
        </div>
      `
    );
  }

  /**
   * Renders a Team
   *
   * @protected
   * @param {Team[]} teams
   * @returns
   * @memberof MgtTeamsChannelPicker
   */
  protected renderTeams(teams: Team[]) {
    return html`
      ${repeat(
        teams,
        teamData => teamData,
        teamData => html`
          <li
            class="list-team teams-channel-list team-list-${teamData.id}"
            @click="${() => this._clickTeam(teamData.id)}"
          >
            <div class="arrow">
              ${teamData.showChannels ? getSvg(SvgIcon.ArrowDown, '#252424') : getSvg(SvgIcon.ArrowRight, '#252424')}
            </div>
            <div class="team-name" title="${teamData.displayName}">
              ${teamData.displayName}
            </div>
          </li>
          <div class="render-channels team-${teamData.id} ${teamData.showChannels ? '' : 'hide-channels'}">
            ${this.renderChannels(teamData.channels)}
          </div>
        `
      )}
    `;
  }

  /**
   * Renders channels
   *
   * @protected
   * @param {MicrosoftGraph.Channel[]} channelData
   * @returns
   * @memberof MgtTeamsChannelPicker
   */
  protected renderChannels(channelData: MicrosoftGraph.Channel[]) {
    let channelView;
    if (channelData && !this.noChannelsFound) {
      channelView = html`
        ${repeat(
          channelData,
          channel => channel,
          channel => html`
            <div class="channel-display" @click=${e => this.addChannel(e, channel)} title="${channel.displayName}">
              ${this.renderHighlightText(channel)}
            </div>
          `
        )}
      `;
    } else {
      if (channelData) {
        const channelids = [];

        for (const team of this.teams) {
          const teamDiv = this.renderRoot.querySelector(`.team-list-${team.id}`);
          const channelDiv = this.renderRoot.querySelector(`.team-${team.id}`);
          teamDiv.classList.add('hide-team');
          if (team.displayName.toLowerCase().indexOf(this._userInput.toLowerCase()) > -1) {
            teamDiv.classList.remove('hide-team');
            channelDiv.classList.remove('hide-channels');
            team.showChannels = true;

            for (const channel of team.channels) {
              channelids.push(channel.id);
            }
          }
        }

        channelView = html`
          ${repeat(
            channelData,
            channel => channel,
            channel => html`
              <div class="channel-display" @click=${e => this.addChannel(e, channel)}>
                <div
                  class="${channelids.indexOf(channel.id) > -1 ? 'showing' : 'hiding'} channel-${channel.id.replace(
                    /[^a-zA-Z ]/g,
                    ''
                  )}"
                >
                  <span class="people-person-text">${channel.displayName}</span>
                </div>
              </div>
            `
          )}
        `;
      }
    }

    return channelView;
  }

  /**
   * Renders selection area of Teams and Channels
   *
   * @protected
   * @returns
   * @memberof MgtTeamsChannelPicker
   */
  protected renderTeamList() {
    let content: TemplateResult;
    if (this.teams) {
      content = this.renderTeams(this.teams);
      if (this.isLoading) {
        content = this.renderTemplate('loading', null, 'loading') || this.renderLoadingMessage();
      } else if (this.noChannelsFound && this._userInput.length > 0 && !this.noListShown) {
        content = this.renderTeams(this.teams);
      } else if (this.noChannelsFound && this._userInput.length > 0 && this.noListShown) {
        content = this.renderTemplate('error', null, 'error') || this.renderErrorMessage();
      } else {
        if (this.teams[0]) {
          (this.teams[0] as any).isSelected = 'fill';
        }
      }
    }

    return html`
      <div class="team-list">
        ${content}
      </div>
    `;
  }

  /**
   * Renders selected Team
   *
   * @protected
   * @returns
   * @memberof MgtTeamsChannelPicker
   */
  protected renderChosenTeam() {
    let peopleList;
    let inputClass = 'input-search-start';

    if (this.selectedTeams[0]) {
      if (this.selectedTeams[0].length) {
        inputClass = 'input-search';

        peopleList = html`
          <li class="selected-team">
            <div class="selected-team-name">${this.selectedTeams[0][0].displayName}</div>
            <div class="arrow">${getSvg(SvgIcon.TeamSeparator, '#B3B0AD')}</div>
            ${this.selectedTeams[1][0].displayName}
            <div class="CloseIcon" @click="${() => this.removePerson(this.selectedTeams[0], this.selectedTeams[1])}">
              
            </div>
          </li>
          <div class="SearchIcon">
            ${this.isFocused ? getSvg(SvgIcon.Search, '#252424') : ''}
          </div>
        `;
      } else {
        peopleList = html`
          <div
            class="InputArrowIcon"
            @click="${e => {
              e.stopPropagation();
              this.isFocused ? this.lostFocus() : this.gainedFocus();
            }}"
          >
            ${this.isFocused ? getSvg(SvgIcon.UpCarrot, '#605E5C') : getSvg(SvgIcon.DownCarrot, '#605E5')}
          </div>
        `;
      }
    }
    return html`
      <div class="people-chosen-list">
        ${peopleList}
        <div class="${inputClass}">
          <input
            id="teams-channel-picker-input"
            class="team-chosen-input ${this.isFocused || this.isHovered ? 'focused' : ''}"
            type="text"
            placeholder="${this.selectedTeams[0].length > 0 ? '' : 'Select a channel '} "
            label="teams-channel-picker-input"
            aria-label="teams-channel-picker-input"
            role="input"
            .value="${this._userInput}"
            @keydown="${this.onUserKeyDown}"
            @keyup="${this.onUserKeyUp}"
          />
        </div>
      </div>
    `;
  }

  private mouseLeft() {
    if (this._userInput.length === 0) {
      this.isHovered = false;
      this.requestUpdate();
    }
  }

  private handleHover() {
    if (this.teams.length === 0) {
      this.loadTeams();
    }
    this.isHovered = true;
    this.requestUpdate();
  }

  private handleWindowClick(e: MouseEvent) {
    if (e.target !== this) {
      this.lostFocus();
    }
  }

  /**
   * Adds debounce method for set delay on user input
   */
  private onUserKeyUp(event: any) {
    if (event.keyCode === 40 || event.keyCode === 38) {
      // keyCodes capture: down arrow (40) and up arrow (38)
      return;
    }

    const input = event.target;

    if (event.code === 'Escape') {
      input.value = '';
      this._userInput = '';
      return;
    }
    if (event.code === 'Backspace' && this._userInput.length === 0 && this.selectedTeams.length > 0) {
      input.value = '';
      this._userInput = '';
      // remove last channel in selected list
      this.selectedTeams = [[], []];
      // fire selected teams changed event
      this.fireCustomEvent('selectionChanged', this.selectedTeams);
      this.handleChannelSearch('');
      this.requestUpdate();
      return;
    }

    this.handleChannelSearch(input);
  }

  /**
   * Tracks event on user input in search
   * @param input - input text
   */
  private handleChannelSearch(input: any) {
    if (!this.debouncedSearch) {
      this.debouncedSearch = debounce(() => {
        if (this._userInput !== input.value) {
          this._userInput = input.value;
          this.loadChannelSearch(this._userInput);
          this.gainedFocus();
          this.arrowSelectionCount = -1;
          this.channelLength = -1;
        }
      }, 200);
    }

    this.debouncedSearch();
  }

  /**
   * Tracks event on user search (keydown)
   * @param event - event tracked on user input (keydown)
   */
  private onUserKeyDown(event: any) {
    if (event.keyCode === 40 || event.keyCode === 38) {
      // keyCodes capture: down arrow (40) and up arrow (38)
      this.handleArrowSelection(event);
      if (this._userInput.length > 0) {
        event.preventDefault();
      }
    }
    if (event.code === 'Tab' || event.code === 'Enter') {
      if (this.teams) {
        event.preventDefault();
      }

      const selectedDiv = this.renderRoot.querySelector('.teams-channel-list-fill');
      if (selectedDiv.classList.contains('list-team')) {
        // clicked team
        if (selectedDiv.classList[2]) {
          this._clickTeam(selectedDiv.classList[2].slice(10));
        }
      } else {
        // clicked channel
        this.addChannel(event, selectedDiv.parentElement.classList[1].slice(5));
      }
    }
  }

  /**
   * Tracks user input when inside team, in order to traverse channels
   *
   * @private
   * @param {*} channels
   * @memberof MgtTeamsChannelPicker
   */
  private handleChannelHighlight(channels: any) {
    // moves counter once for user input
    const htmlCount = this.channelCounter + 1;
    const displayedChannels = [];

    // if channel is not filtered by search (showing)
    for (let i = 0; i < channels.length; i++) {
      if (channels[i].children[0].classList.contains('showing')) {
        displayedChannels.push(channels[i]);
      }
    }
    displayedChannels[htmlCount].classList.add('teams-channel-list-fill');
  }

  private handleTeamHighlight(team: any) {
    if (team) {
      team.classList.add('teams-channel-list-fill');
    }
  }

  /**
   * Tracks user key selection for arrow key selection of channels
   * @param event - tracks user key selection
   */
  private handleArrowSelection(event: any) {
    // resets highlight
    const teamList = this.renderRoot.querySelector('.team-list');
    for (let i = 0; i < teamList.children.length; i++) {
      teamList.children[i].classList.remove('teams-channel-list-fill');
    }

    const teamDivs = teamList.children;

    const showingDivs = [];

    for (let i = 0; i < teamDivs.length; i++) {
      const elems = teamDivs[i];
      if (elems.classList.contains('hide-channels') || elems.classList.contains('hide-team')) {
      } else {
        showingDivs.push(elems);
      }
    }

    let teamLength = 0;
    let isLast = false;

    for (const item of showingDivs) {
      if (showingDivs[this.arrowSelectionCount + 1]) {
        if (
          item.classList.contains('list-team') ||
          !showingDivs[this.arrowSelectionCount + 1].classList.contains('hide-channels')
        ) {
          teamLength++;
        }
      } else {
        isLast = true;
      }
    }

    if (this.teams.length && !this.isLoading) {
      if (event !== null) {
        // update arrow count
        if (event.keyCode === 38) {
          // up arrow
          if (this.arrowSelectionCount >= 1) {
            this.arrowSelectionCount--;
          }
        }
        if (event.keyCode === 40) {
          if (!isLast) {
            // down arrow
            this.arrowSelectionCount++;
            if (
              showingDivs[this.arrowSelectionCount] &&
              showingDivs[this.arrowSelectionCount].classList.contains('render-channels')
            ) {
              this.arrowSelectionCount++;
            }
          } else {
            this.arrowSelectionCount = -1;
          }
        }
      }

      const channelSection = showingDivs[this.arrowSelectionCount - 1];

      if (channelSection) {
        if (channelSection.classList.contains('render-channels')) {
          this.channelLength = -1;

          for (let i = 0; i < channelSection.children.length; i++) {
            channelSection.children[i].classList.remove('teams-channel-list-fill');
            if (channelSection.children[i].clientHeight > 0) {
              this.channelLength++;
            }
          }

          if (this.channelCounter + 1 <= this.channelLength) {
            this.handleChannelHighlight(channelSection.children);
            this.arrowSelectionCount = this.arrowSelectionCount - 2;
            this.channelCounter++;

            return;
          } else {
            if (showingDivs[this.arrowSelectionCount]) {
              this.handleTeamHighlight(showingDivs[this.arrowSelectionCount]);
              // this.arrowSelectionCount--;
            } else {
              this.arrowSelectionCount = -1;
            }

            this.channelCounter = -1;
          }
        } else {
          if (this.arrowSelectionCount === teamLength) {
            this.arrowSelectionCount = 0;
            this.handleTeamHighlight(showingDivs[this.arrowSelectionCount]);
          } else {
            if (this.channelCounter === -1) {
              this.handleTeamHighlight(showingDivs[this.arrowSelectionCount]);
            }
          }
        }
      } else {
        this.handleTeamHighlight(showingDivs[this.arrowSelectionCount]);
      }
    }
  }

  private async loadTeams() {
    const provider = Providers.globalProvider;
    if (provider) {
      if (provider.state === ProviderState.SignedIn) {
        const graph = provider.graph.forComponent(this);

        this.teams = await getAllMyTeams(graph);

        this.isLoading = true;
        const batch = provider.graph.createBatch();

        for (const [i, team] of this.teams.entries()) {
          batch.get(`${i}`, `teams/${team.id}/channels`, ['user.read.all']);
        }
        const response = await batch.execute();
        for (const [i, team] of this.teams.entries()) {
          team.channels = response[i].value;
        }
      }
    }
    this.isLoading = false;
  }

  private resetTeams() {
    for (const team of this.teams) {
      const teamdiv = this.renderRoot.querySelector(`.team-list-${team.id}`);
      teamdiv.classList.remove('hide-team');
      team.showChannels = false;
    }
  }

  /**
   * Async method which query's the Graph with user input
   * @param name - user input or name of person searched
   */
  private loadChannelSearch(name: string) {
    this.noChannelsFound = false;
    if (name === '') {
      this.resetTeams();
      return;
    }
    const foundMatch = [];
    for (const team of this.teams) {
      for (const channel of team.channels) {
        if (channel.displayName.toLowerCase().indexOf(name) !== -1) {
          foundMatch.push(team.displayName);
        }
      }
    }

    if (foundMatch.length) {
      for (const team of this.teams) {
        const teamdiv = this.renderRoot.querySelector(`.team-list-${team.id}`);
        if (teamdiv) {
          teamdiv.classList.remove('hide-team');
          team.showChannels = true;
          if (foundMatch.indexOf(team.displayName) === -1) {
            team.showChannels = false;
            teamdiv.classList.add('hide-team');
          }
        }
      }
    } else {
      this.noChannelsFound = true;
    }
  }

  /**
   * Removes person from selected people
   * @param person - person and details pertaining to user selected
   */
  private removePerson(team: MicrosoftGraph.Team[], pickedChannel: MicrosoftGraph.Channel[]) {
    this.selectedTeams = [[], []];
    this._userInput = '';

    this.resetTeams();
    this.fireCustomEvent('selectionChanged', this.selectedTeams);
  }

  private renderErrorMessage() {
    return html`
      <div class="message-parent">
        <div label="search-error-text" aria-label="We didn't find any matches." class="search-error-text">
          We didn't find any matches.
        </div>
      </div>
    `;
  }

  private renderLoadingMessage() {
    return html`
      <div class="message-parent">
        <div class="spinner"></div>
        <div label="loading-text" aria-label="loading" class="loading-text">
          Loading...
        </div>
      </div>
    `;
  }

  private gainedFocus() {
    this.isFocused = true;
    const teamList = this.renderRoot.querySelector('.team-list');
    const teamInput = this.renderRoot.querySelector('.team-chosen-input') as HTMLInputElement;
    teamInput.focus();

    if (teamList) {
      // Mouse is focused on input
      teamList.setAttribute('style', 'display:block');
    }
    this.requestUpdate();
  }

  private lostFocus() {
    this.isFocused = false;
    this._userInput = '';
    this.resetTeams();
    const teamList = this.renderRoot.querySelector('.team-list');
    if (teamList) {
      teamList.setAttribute('style', 'display:none');
    }
    this.requestUpdate();
  }

  private renderHighlightText(channel: MicrosoftGraph.Channel) {
    // tslint:disable-next-line: prefer-const
    let channels: any = {};

    let shouldShow = true;

    const highlightLocation = channel.displayName.toLowerCase().indexOf(this._userInput.toLowerCase());
    if (highlightLocation !== -1) {
      // no location
      if (highlightLocation === 0) {
        // highlight is at the beginning of sentence
        channels.first = '';
        channels.highlight = channel.displayName.slice(0, this._userInput.length);
        channels.last = channel.displayName.slice(this._userInput.length, channel.displayName.length);
      } else if (highlightLocation === channel.displayName.length) {
        // highlight is at end of the sentence
        channels.first = channel.displayName.slice(0, highlightLocation);
        channels.highlight = channel.displayName.slice(highlightLocation, channel.displayName.length);
        channels.last = '';
      } else {
        // highlight is in middle of sentence
        channels.first = channel.displayName.slice(0, highlightLocation);
        channels.highlight = channel.displayName.slice(highlightLocation, highlightLocation + this._userInput.length);
        channels.last = channel.displayName.slice(
          highlightLocation + this._userInput.length,
          channel.displayName.length
        );
      }
    } else {
      shouldShow = false;
    }

    return html`
      <div class="${shouldShow ? 'showing' : ''} channel-${channel.id.replace(/[^a-zA-Z ]/g, '')}">
        <span class="people-person-text">${channels.first}</span
        ><span class="people-person-text highlight-search-text">${channels.highlight}</span
        ><span class="people-person-text">${channels.last}</span>
      </div>
    `;
  }

  private addChannel(event, pickedChannel: any) {
    // reset blue highlight

    for (const team of this.teams) {
      for (let i = 0; i < team.channels.length; i++) {
        const selection = team.channels[i].id.replace(/[^a-zA-Z ]/g, '');
        const channelDiv = this.renderRoot.querySelector(`.channel-${selection}`);
        channelDiv.parentElement.classList.remove('blue-highlight');
      }
    }

    if (event.key === 'Tab') {
      for (const team of this.teams) {
        if (team.id === pickedChannel) {
          const selection = team.channels[this.channelCounter].id.replace(/[^a-zA-Z ]/g, '');
          const channelDiv = this.renderRoot.querySelector(`.channel-${selection}`);

          const shownIds = [];

          // check if channels are filtered
          for (let i = 0; i < channelDiv.parentElement.parentElement.children.length; i++) {
            if (channelDiv.parentElement.parentElement.children[i].children[0].classList.contains('showing')) {
              shownIds.push(channelDiv.parentElement.parentElement.children[i].children[0].classList[1].slice(8));
            }
          }

          for (const channel of team.channels) {
            if (channel.id.replace(/[^a-zA-Z ]/g, '') === shownIds[this.channelCounter]) {
              this.selectedTeams = [[team], [channel]];
            }
          }

          channelDiv.parentElement.classList.add('blue-highlight');
          this.arrowSelectionCount = -1;
          this.lostFocus();
        }
      }
    } else {
      const teamDiv =
        event.target.parentNode.parentNode.classList[1] || event.target.parentNode.parentNode.parentNode.classList[1];
      if (teamDiv) {
        const teamId = teamDiv.slice(5, teamDiv.length);
        for (const team of this.teams) {
          if (team.id === teamId) {
            this.selectedTeams = [[team], [pickedChannel]];
            const selection = pickedChannel.id.replace(/[^a-zA-Z ]/g, '');
            const channelDiv = this.renderRoot.querySelector(`.channel-${selection}`);
            channelDiv.parentElement.classList.add('blue-highlight');
            this.lostFocus();
          }
        }
      }
    }
    this._userInput = '';
    this.arrowSelectionCount = -1;
    this.channelCounter = 0;
    this.requestUpdate();
  }

  private _clickTeam(id: string) {
    const team = this.renderRoot.querySelector('.team-' + id);

    for (const teams of this.teams) {
      if (teams.id === id) {
        teams.showChannels = !teams.showChannels;
      }
    }

    this.requestUpdate();
  }
}